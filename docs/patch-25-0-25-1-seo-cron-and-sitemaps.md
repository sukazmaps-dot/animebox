# AnimeBox SEO Patch 25.0 + 25.1 — Railway Cron Recovery & Sitemap Reliability

**Дата:** 12.10.2026. **Репозиторий:** `sukazmaps-dot/animebox`. **Продакшен:** `https://youranimebox.com`, Railway, Next.js 16.3.5. **База:** Supabase.

## 1. Почему патч нужен

После перехода с Vercel на Railway расписание из `vercel.json` перестало иметь отношение к рабочему хостингу.
В Railway production-сервис `animebox` работает непрерывно как HTTP-приложение, `cronSchedule=null`.
Нельзя ставить `cronSchedule` на этот сервис: Railway превратит веб-службу в периодическую задачу и сайт перестанет обслуживать запросы.

Проверка Supabase на 12.10.2026:
- В `seo_anime_index` 3774 записи, все `indexable=true`.
- Последнее успешное `system_job_runs(job_key='seo-anime-index')` — 04.10.2026; после него новых записей о запуске нет.
- Все 3774 `last_verified_at` старше 7 суток.
- `seo_episode_index`: 35290 indexable-записей, `seo_video_episode_index`: 34746 записей. Это **реестр**, не измерение Google Search Console.
- Supabase уже содержит `pg_cron`, `pg_net`, `supabase_vault`, а также сторонние фоновые задания.
- Существующий cron уведомлений обращается к сайту, но Railway показал за 24 часа 288 HTTP 4xx и 0 2xx; pg_net также фиксировал 401. **Запрещено повторно использовать его секрет без проверки.**
- Существующие sitemap-обработчики тайтлов/эпизодов при ошибке Supabase возвращали `[]`, то есть успешный пустой sitemap.

## 2. Цели и ограничения

### P0: ежедневный SEO refresh
- Независимый от Vercel и Railway Deploy планировщик на Supabase Cron.
- 04:53 UTC: основной HTTP POST; 06:23 UTC: один условный повтор при отсутствии успешного запуска за текущие UTC-сутки.
- Прежний rate budget: 7 шардов из 70 за запуск; полный цикл в норме — 10 дней.
- Сохранить последовательную работу с AniList и ограничение 50 секунд по времени.
- Не менять ограничения правообладателей, RLS, таблицы, оптимизации мини-приложения и playback.
- Не затрагивать уже работающие фоновые задания.

### P0: безопасная авторизация
- Секрет в Railway `SEO_INDEX_CRON_SECRET`, в Vault — под именем `animebox_seo_index_cron_secret`. Значения **должны совпадать**.
- Запрос использует заголовок `x-seo-cron-secret`, а не query string.
- `isSeoCronAuthorized` проверяет выделенный секрет постоянным по времени сравнением и оставляет совместимость с `CRON_SECRET` только на этом маршруте.
- Недействительный или отсутствующий секрет возвращает HTTP 401 без запуска задания.
- Никогда не помещать секрет в GitHub, `cron.job.command`, SQL-миграцию, query-параметры или логи.
- SQL-миграция **преднамеренно не применяется**, пока в Vault нет выделенного секрета. Перед первой активацией нужна настройка Railway и Vault.

### P0: повтор с контролем результата
- `pg_cron` сигнализирует лишь о выполнении SQL и постановке HTTP-запроса в очередь.
- `net._http_response` используется для HTTP-кода, `system_job_runs` — для завершения бизнес-операции.
- Допустимые статусы приложения: succeeded / failed / degraded / skipped. `skipped` из-за lease/brownout — не подтверждение обновления индекса.
- Повтор выполняется только если сегодня нет `succeeded`, без параллельных потоков и полного принудительного реиндекса.

### P0: sitemap fail honesty
- `app/anime/sitemap.ts` и `app/episodes/sitemap.ts` не должны выдавать 200+пустой XML на ошибку базы.
- Ошибка пробрасывается в Next.js как серверная ошибка (обычно HTTP 500), что позволяет роботу попробовать снова. Для MetadataRoute точный 503 не обещается.
- `app/sitemap-recent.xml/route.ts` и `app/video-sitemap.xml/route.ts` уже возвращают 503/no-store при ошибках — оставить.
- Правильный пустой результат при реально пустом шарде разрешён.
- Любые Sitemap разрешают только реальные индексируемые записи; не добавлять искусственные URL.

### P1: детерминированная разбивка эпизодов
- Было: сортировка по `last_confirmed_at DESC` плюс offset/range. При обновлениях записи могли перескакивать между шардами.
- Стало: `ORDER BY anime_id ASC, episode_number ASC` на том же фильтре `indexable=true` и том же диапазоне.
- База имеет первичный ключ `(anime_id, episode_number)`; новый индекс миграцией **не нужен**.
- `lastmod` отражает `last_content_change_at` либо `first_available_at`, а не текущую дату запроса.
- Новая строка, вставленная до уже выданного offset в разных запросах, всё ещё теоретически может сдвинуть диапазон; для полной snapshot-стабильности в будущем нужен разбор keyset/fixed-bucket стратегии.

## 3. Обновлённые файлы

- `app/api/cron/seo-anime-index/route.ts` — выделенная авторизация.
- `supabase/migrations/20261012143500_seo_index_railway_cron_recovery_v1.sql` — два именованных cron-задания, preflight Vault, ограниченный timeout.
- `app/anime/sitemap.ts`, `app/episodes/sitemap.ts` — не скрывают ошибки.
- `lib/seo-episodes.ts` — стабильный композитный порядок.
- `scripts/seo-cron-recovery-check.mjs` — регрессионные инварианты в CI и prebuild.
- `scripts/seo-live-audit.mjs` — read-only аудит публичных XML и нескольких canonical/noindex SSR страниц.
- `.github/workflows/animebox-quality.yml`, `package.json` — проверка перед релизом.

## 4. Release runbook (порядок обязателен)

1. Прогнать `npm run seo-cron-recovery:check`, `npx tsc --noEmit`, `npm run build` в PR. Дождаться зелёного CI.
2. Сгенерировать уникальный стойкий случайный секрет минимум 32 байта для SEO. **Не повторять** нынешние `CRON_SECRET` или секрет уведомлений.
3. В Railway production для `animebox` добавить `SEO_INDEX_CRON_SECRET=<случайный секрет>` через интерфейс Environment Variables. Не изменять имеющийся `CRON_SECRET`.
4. В Supabase Vault создать секрет **с тем же значением** под именем `animebox_seo_index_cron_secret`. Секрет не должен попасть в историю миграций.
5. Дождаться успешного деплоя кода с новым заголовком авторизации.
6. На этапе активации проверить без секретов: HTTP POST на SEO endpoint должен вернуть 401; валидный запрос с новым секретом должен пройти (200 и `ok=true`), появиться в `system_job_runs`. Тестовый валидный запрос запускает работу — не повторять многократно.
7. Только затем применить файл миграции через Supabase migrations/SQL Editor. Проверьте `cron.job` по **именам** и статусу активности, не выводя поле `command` целиком.
8. Контролировать очередной запуск 04:53 UTC: cron run -> `net._http_response.status_code = 200` -> `system_job_runs.status = succeeded`. Ошибка или отсутствие успеха к 06:23 UTC запускают единственный повтор.
9. Запустить `node scripts/seo-live-audit.mjs` на опубликованном сайте. Проверить любые 401/403, 5xx, пустые XML и расхождения canonical.
10. После одной успешной итерации и через 10 UTC-дней подтвердить обновление `last_verified_at` во всех обработанных группах.

## 5. Мониторинг без чтения секретов

```sql
-- Фактические результаты SEO-задания (бизнес-операция).
select job_key, status, started_at, finished_at, error_code, duration_ms
from public.system_job_runs
where job_key = 'seo-anime-index'
order by started_at desc limit 20;

-- Состояние расписаний. Поле command специально НЕ выводим.
select jobname, schedule, active
from cron.job
where jobname in ('animebox-seo-anime-index', 'animebox-seo-anime-index-retry')
order by jobname;

-- Фактическое время проверки SEO-каталога.
select count(*) as total,
       count(*) filter (where last_verified_at < now() - interval '7 days') as stale_7d,
       max(last_verified_at) as latest_verified_at
from public.seo_anime_index;
```

HTTP-ответы отслеживать в Railway HTTP logs для `/api/cron/seo-anime-index`, а не только по `cron.job_run_details`. Состояние старого cron уведомлений рассматривается отдельно: этот релиз **не меняет** его настройки.

## 6. Приёмочные сценарии

1. Отсутствующий выделенный секрет в Railway: входящий `x-seo-cron-secret` не разрешает запуск.
2. Неверный секрет: HTTP 401, `system_job_runs` не создаёт рабочую задачу.
3. Валидный секрет: реальный bounded run, результаты в `system_job_runs`.
4. Два конкурентных запуска: один может отчитаться `already_running`, не выполняется двойная нагрузка.
5. Ошибка AniList: `failed` и повтор по расписанию; существующие sitemap-строки не удаляются.
6. Ошибка чтения SEO-реестра: sitemap аниме/эпизодов **не** отдаёт HTTP 200 с пустыми `<urlset>`.
7. Отсутствующий реальный shard: корректный пустой результат остаётся допустим.
8. Обновление `last_confirmed_at` не меняет порядок эпизодов в шардированном списке.
9. Для нескольких публичных title/episode URL canonical совпадает с `<loc>`, robots позволяет индексировать, страница отвечает 200.
10. В `/robots.txt` присутствует одна каноническая ссылка на `/sitemap-index.xml`; карта содержит root, recent, video, anime и episode shards.
11. Действующие copyright/noindex/redirect и приватные маршруты не изменились.
12. Production build и TypeScript, включая quality gate, проходят.
13. Ни один новый ключ не виден в GitHub или ответах публичных API.

## 7. Риски и откат

- При несовпадении секретов cron запросы получат 401: сначала проверить настройку, не ослаблять авторизацию.
- `pg_net` ограничен таймаутом 55 сек; `maxDuration=60`, рабочий бюджет приложения 50 сек. Планировщик сообщает об enqueue, не об успехе.
- Если индексатор перегружает провайдер, остановить **только** новые cron-задания через `cron.unschedule` по именам; не трогать веб-сервис.
- При проблемах с Sitemap откатить PR, оставить URL в IndexNow/Google Search Console до исправления, не возвращать фальшивый пустой 200.
- В случае отсутствия нужных секретов/прав в продуктивной инфраструктуре оставлять миграцию неприменённой. GitHub PR сам по себе cron не запускает.

## 8. Метрики и ожидаемый эффект

Операционные KPI: ежедневная запись `succeeded`, отсутствие 401 у нового SEO endpoint, уменьшение старых `last_verified_at`, отсутствие 200 для пустых XML при сбоях Supabase. Продуктовые KPI через GSC: indexed pages, impressions, clicks, CTR, canonical coverage. Эти изменения **не гарантируют** индексацию или рост позиций.
