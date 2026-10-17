# Patch 31.16 — Supabase outage resilience (аварийный патч)

## 0. Основание и диагноз
17.10.2026 около 19:30–20:00 UTC у AnimeBox наблюдались ошибки PostgREST PGRST002 (невозможно обновить schema cache), 522 на Supabase API и `Connection terminated due to connection timeout` даже на `SELECT 1`. Параллельно в PostgreSQL фиксировались `statement timeout` и `cron job 1/8 startup timeout`. Railway production выдавал много 503 на `/api/image`, `/api/recommendations` и 499 на `/api/anime`. Это НЕ доказательство DDoS и НЕ доказательство, что cron — первопричина.

Hotfix 31.15 отсоединил публичный image/proxy limiter от Supabase и восстановил ответы `/api/image`. Но reads реестра и saved catalog продолжали нагружать PostgREST и тормозили главную/каталог. Сайт может отдавать 200 для HTML-оболочки, даже когда данные недоступны.

## 1. Цели
- Быстро прекращать бессмысленные публичные чтения при недоступном PostgreSQL, без новых тяжёлых запросов и бесконечных retries.
- Ограничить один запрос к registry 1.8 секунды, к saved playable catalog — 2.2 секунды.
- В каждом *процессе* держать независимые cooldown (12 секунд) только для необязательных публичных чтений. После cooldown следующая попытка является проверкой восстановления, успех сбрасывает ограничение.
- Во время известной аварии сохранить только ранее подтверждённые playable snapshot: неизвестные тайтлы не публиковать, не путать unknown/unavailable/playable.
- Не инициировать дорогие фоновые проверки провайдеров/записи, если уже доказана недоступность реестра.
- `/api/anime` не должен отдавать закешированный HTTP 200 с пустым каталогом при failure реестра. При отсутствии подтверждённых данных: 503 + Retry-After:12 + no-store на browser/CDN/Vercel/Cloudflare; при наличии ранее проверенных строк: частичный degraded 200, но no-store и честный metadata message.
- Автоматическое восстановление без рестарта Railway.

## 2. Изменяемые файлы и контракт
- `lib/public-read-circuit.ts`: компактный замкнутый предохранитель; process-local, нет сетевых запросов, нет IP/user data, детерминированный clock для тестов. Fail закрывает на 12 s; timeout естественно открывает probe; success сбрасывает state.
- `lib/catalog-availability-server.ts`: timeout + circuit; coalesced miss reads сохранены; при outage возвращать `registryHealthy:false`, verifiedSnapshot и никакого negative cache; фоновые refresh пропускаются при unhealthy.
- `lib/saved-catalog-server.ts`: timeout + независимый cooldown; схемные ошибки могут использовать существующий compatibility fallback. Настоящий network outage не запускает альтернативные DB запросы.
- `app/api/anime/route.ts`: HTTP 503 на полностью недоступной availability; если verified snapshot есть, отдаёт часть списка с source=degraded и no-store. Всегда защищает от cache poisoning.
- `tests/patch31-16-db-outage.cjs` плюс имеющийся `tests/catalog-recovery-fix.cjs`: тест cooldown, восстановления, лимитов и контрактов.
- `package.json` и `.github/workflows/animebox-quality.yml`: включить тест на CI и prebuild.

## 3. Строгие инварианты безопасности
- НЕ применять circuit к Auth, Telegram подписке/сессиям, платежам, мутациям, upload, персональным профилям и RLS.
- НЕ отключать shared fail-closed лимит `consume_api_rate_bucket` на чувствительных маршрутах.
- Никаких открытых service_role ключей и секретов в клиенте, ответах и логах.
- НЕ менять список playback provider allowlist, подтверждение доступности, TTL playable/degraded и SEO-каноникализацию.
- Никаких SQL-миграций, purge или рестартов базы в рамках frontend/backend hotfix. `PGRST002` — проблема доступности БД, а не сигнал менять schema.
- Ошибка инфраструктуры никогда не интерпретируется как подтверждение отсутствия тайтла.

## 4. Проверки перед merge
1. Узловой тест circuit: cold pass, failure open, 11.999 s blocked, 12 s retry, success reset.
2. Registry read имеет реальный AbortSignal.timeout; unhealthy не попадает в negative cache.
3. Повторные background probes не запускаются на известной аварии.
4. Saved catalog recovery не перебирает альтернативные SQL таблицы при обычной сетевой ошибке.
5. API 503 не кешируется CDN и снабжается Retry-After; partial verified ответ no-store.
6. Legacy `catalog-recovery`, Quality Gate, TS build, prebuild и security checks проходят.
7. После слияния развернуть Railway production; проверить /api/image, /api/anime, /api/recommendations, P95 и 5xx до/после. `/api/image` alone не доказывает, что БД восстановлена.
8. Не делать false-positive вывод «всё работает», если SQL `SELECT 1` по-прежнему недоступен.

## 5. Роллбэк и внешняя диагностика
Откатить 31.16 на предыдущий успешный Railway deployment, только если регрессия в продакшене доказана по HTTP/логам. Различать status web-shell и содержимое API. Отдельно исследовать DB CPU/RAM/IO, pg_stat_activity, locks, cron.job и cron.job_run_details только после возврата подключения и в режиме read-only. При сохраняющихся 522/PGRST002 эскалировать Supabase Support с временным окном и проектом liwhdayjdiebxmunphma. Не «лечить» аварийную БД массовым retry.
