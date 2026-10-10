# AnimeBox: восстановление постеров, диагностика Telegram и целостность sitemap

Дата: 11 октября 2026, Asia/Qyzylorda.

## 1. Цель

Устранить подтверждённую порчу URL в recent sitemap, подготовить управляемое восстановление постеров при блокировке Cloudflare Worker внешним источником и дать владельцу безопасную диагностику Telegram после переноса на Railway.

Патч строится поверх PR #185. Этот PR ещё не слит в main на момент начала работы. Ошибка callback на localhost сохраняется в production, пока #185 не выпущен. Данное изменение не следует выдавать за уже работающий production-фикс.

## 2. Приоритеты

| Приоритет | Проблема | Результат |
|---|---|---|
| P0 | Recent sitemap разрушает абсолютные URL | Валидные точные HTTPS-адреса, пригодные для обхода |
| P1 | Media Worker получает origin-403 | Не более одной дополнительной попытки через фиксированный канонический proxy, включаемой явно |
| P1 | Состояние Telegram webhook неизвестно | Только owner видит состояние регистрации и доставки без токенов |
| P2 | Отсутствует контроль sitemap на выпуске | Read-only XML smoke и обязательный route regression test |

## 3. Подтверждённые наблюдения

### 3.1. Search Console

На присланном скриншоте спад начинается примерно 3 октября, после более высоких показателей 2 октября. Tooltip за 5 октября показывает 2 показа и 0 кликов. Это не доказывает причину, но требует проверки технических ошибок, а не объяснения только неполными данными последнего дня.

В течение того же периода пользователь сообщал о проблемах Vercel и переезде. Полного архива HTTP-ответов за 3–5 октября в рабочем окружении нет. Следовательно, исторический простой — гипотеза до проверки логов и Search Console.

### 3.2. Recent sitemap

В production /sitemap-recent.xml обнаружены ссылки вида:

```text
https//yoranimebox.com/anime/shishido-jorney-
```

В загруженном XML найдено 4000 loc-элементов страниц и изображений. Все 4000 не являются корректными абсолютными HTTPS URL. Это число элементов XML, а не число отдельных страниц сайта.

Причина в app/sitemap-recent.xml/route.ts: регулярное выражение записано с двойными обратными слешами перед Unicode escape. Вместо удаления управляющих кодов оно удаляет обычные символы, в том числе u, цифры и двоеточия. Итоговый XML синтаксически разбирается, но ссылки непригодны.

Проверены соседние обработчики: video sitemap использует правильный Unicode escape; sitemap index и robots.txt сейчас доступны, robots.txt разрешает публичный обход. Нельзя распространять дефект recent sitemap на все карты без отдельных измерений.

### 3.3. Постеры

Для реальной обложки AniList с главной страницы:

```text
https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-qQTzQnEJJ3oB.jpg
```

Media Worker версии media-shield-v5-shikimori-io вернул HTTP 204, X-AnimeBox-Media: source-soft-fail, X-AnimeBox-Origin-Error: origin-403. Канонический /api/image вернул декодируемый JPEG 460×649, 136267 байт.

Это подтверждает различие двух маршрутов доставки. Оно не устанавливает правила блокировки AniList CDN и не доказывает, что все источники одинаково недоступны.

### 3.4. Ограничение проверки relay

В тесте из рабочего окружения реальный запрос /api/image занял около 11,9 секунды. Попытка уложить rescue в 2 секунды завершилась relay-timeout. Локальный runtime не является Cloudflare Worker, поэтому это не измерение задержки Worker → Railway. Но оно запрещает заявлять, что новый резервный путь уже доказанно работает в Cloudflare.

Relay по умолчанию выключен. Его активация требует измерения в Cloudflare; если маршрут не укладывается в бюджет, сохранить клиентский fallback и отключить relay. Общий бюджет не увеличивается ради маскировки задержки.

## 4. Требования к sitemap

### 4.1. Минимальное исправление

- Исправить только Unicode escape в существующем sanitizer.
- Удалять управляющие символы, запрещённые существующей политикой XML.
- Сохранять схему https://, двоеточия, буквы, цифры и percent-encoding.
- Сохранять экранирование &, <, >, двойной и одинарной кавычки.
- Не менять структуру sitemap, namespace, lastmod и окно recent.
- Не менять качество контента, критерии indexable и правообладательские ограничения.
- Не включать noindex страницы в карты только ради роста числа URL.
- Не подменять все отсутствующие страницы HTTP 200.
- Не менять канонический домен и существующие slug.

### 4.2. Проверка настоящего обработчика

Исполнить GET с моками Supabase и copyright registry, а не тестировать копию regex:

- Title slug unique-journey-12345 должен сохраняться точно.
- Episode URL должен сохранять /episode/12.
- Image URL должен сохранять s4.anilist.co и числовой идентификатор.
- Query a=1&size=2 должен сериализоваться через &amp;.
- Каждый извлечённый loc должен разбираться как HTTPS URL.

### 4.3. Публичный smoke

Добавить scripts/seo-sitemap-smoke.py, использующий только Python standard library:

- По умолчанию проверять sitemap-index.xml и sitemap-recent.xml.
- Разрешать целевой публичный AnimeBox HTTPS-домен; не произвольные приватные адреса.
- Таймаут запроса 20 секунд.
- Максимум 8 MiB для одного XML.
- Проверять MIME XML, ожидаемый namespace и root urlset/sitemapindex.
- Использовать настоящий XML parser, а не только регулярное выражение.
- Проверять URL всех loc, включая image:loc.
- Пустую карту показывать как неуспех данной проверки, отдельно от валидности XML.
- Некорректные ссылки, HTML вместо XML и malformed XML возвращают ненулевой exit code.
- Не отправлять карты в Search Console автоматически.

```bash
python3 scripts/seo-sitemap-smoke.py
python3 scripts/seo-sitemap-smoke.py https://youranimebox.com/sitemap-recent.xml
```

## 5. Требования к восстановлению media Worker

### 5.1. Управление

Новая версия: media-shield-v6-origin-relay.

Новая переменная только в animebox-media Worker:

```text
MEDIA_ORIGIN_RELAY_ENABLED=true
```

Это Variable/Config, не Secret. Только точная строка true включает rescue. Отсутствие переменной, false или другое значение оставляет старый путь без дополнительного трафика на Railway.

Не добавлять эту переменную в Railway или Vercel: она управляет Worker. Не копировать service role, bot token или gateway secret в media Worker.

### 5.2. Условия rescue

- Выполнить обычную попытку трансформации и raw pipeline.
- Rescue допускается только при raw error origin-403.
- Если transform не сработал, но raw image получен, relay не нужен.
- Для 404, 429, 5xx или сетевой ошибки сохранить существующие retry/backoff правила.
- Не запускать relay параллельно с origin для каждого постера.
- Не выполнять несколько relay retry.
- Дополнительная попытка занимает не более 2000 мс.
- Дедлайн всей pipeline остаётся 5800 мс.
- Фактический relay timeout равен min(2000, остаток общего бюджета).
- При исчерпанном бюджете не отправлять сетевой запрос.

### 5.3. Фиксированный доверенный маршрут

Единственный relay target:

```text
https://youranimebox.com/api/image?url=<validated-source>
```

- Не принимать relay origin из query или произвольной env-переменной.
- Повторно проверить source существующим parseSource/allowlist.
- Запретить credentials, HTTP, произвольные порты и неподдерживаемые hostname.
- Не разрешать самого AnimeBox как source: предотвращение рекурсии.
- Не передавать browser Cookie, Authorization, forwarded headers или приватные env secrets.
- Передавать только Accept, signal, method GET и redirect manual.
- Redirect от canonical endpoint не следовать; он считается отказом.
- Существующий /api/image остаётся защищённым allowlist, лимитами размера и rate limit.
- Не отключать origin lock ради relay. Если gateway secret блокирует маршрут, rescue заканчивается отказом.

### 5.4. Валидация ответа

- Требуется HTTP 200.
- HTTP 204 не является успешным изображением.
- Разрешены растровые MIME JPEG, PNG, WebP, AVIF, GIF.
- SVG placeholder и HTML не принимать.
- Сохранить существующее ограничение тела 10 MiB и проверку Content-Length.
- Проверять сигнатуру формата и соответствие MIME.
- Signature check Worker не является полным декодированием изображения. Живая приёмка использует существующий sharp-based media:poster:smoke.
- Ошибки relay показывать отдельным X-AnimeBox-Relay-Error с ограниченной машинной причиной.
- Сохранить клиентский fallback при отказе rescue; Worker не должен превращать ошибку в пустой успешный 200.

### 5.5. Кеш и нагрузка

- Успешные relay bytes являются raw source, а не трансформированным WebP/AVIF требуемой ширины.
- Никогда не записывать relay bytes в R2 variant key.
- Не записывать их в долгоживущий общий R2 raw key.
- Использовать отдельный source cache namespace /cache/origin-relay/v1/<hash>.
- TTL edge cache — 600 секунд, browser max-age — 60 секунд.
- Ключ включает полный validated source URL, включая query.
- Все widths одного source могут использовать одни raw bytes.
- HEAD должен сохранять соответствующие заголовки без тела.
- После TTL обычный origin pipeline повторно проверяется.
- При выключенном флаге relay cache не использовать.
- Сохранить source-negative cache и ограничение повторных отказов.
- In-flight source probes объединяют одновременно ожидающие widths в одном isolate.
- Успешный source relay отдавать ожидающим widths напрямую, не повторяя rescue.
- Это не распределённая блокировка между всеми Cloudflare POP; такую гарантию не заявлять.

### 5.6. Диагностика /health

Добавить публичные несекретные поля:

- originRelayEnabled;
- originRelayTimeoutMs;
- originRelayCacheTtlSeconds.

Успешный /health по-прежнему не доказывает загрузку реальных постеров.

## 6. Telegram owner diagnostics

### 6.1. Endpoint

```text
GET /api/admin/telegram/health
```

- Сначала requireAdmin(['owner']).
- Не разрешать guest, обычному пользователю, moderator или admin, если он не owner.
- Дополнительный лимит 10 проверок в минуту на проверенный user ID.
- Только после авторизации и лимита читать server-only secrets.
- Секреты остаются TELEGRAM_BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET из Railway.
- Делать только getWebhookInfo; setWebhook здесь отсутствует.
- Не отправлять сообщения и не создавать платежные updates.
- Telegram timeout — 10 секунд, redirect error, cache no-store.
- Возвращать private no-store; endpoint не должен попадать в public cache.

### 6.2. Состояния

| State | Значение |
|---|---|
| misconfigured | Server credentials отсутствуют или имеют неподходящий формат |
| unavailable | Telegram API отказал, вернул неподходящие данные или недоступен по сети |
| degraded | URL webhook не совпадает, есть свежая ошибка доставки или существенная очередь |
| ready | URL совпадает, метаданные корректны, нет свежей ошибки и большой очереди |

ready обозначает состояние регистрации по доступным метаданным, а не доказанный end-to-end ответ бота. Отдельно выводить secretRegistrationVerified=false: getWebhookInfo не раскрывает secret_token и не позволяет подтвердить его совпадение с Railway.

### 6.3. Безопасные поля

- botTokenConfigured и webhookSecretConfigured — только boolean.
- checkedAt — время проверки.
- webhookConfigured и canonicalUrlMatches — только boolean.
- pendingUpdates — валидный счётчик либо null.
- lastErrorAt — timestamp либо null.
- recentError — ошибка за последние 15 минут.
- lastErrorCategory — access_denied/server_error/tls_error/timeout/network_error/delivery_error.
- reason — ограниченная машинная причина.

Не выдавать token, secret, raw API URL, сырую last_error_message, URL старой регистрации с возможным секретом или сообщения пользователей. Историческую ошибку суточной давности не считать автоматически текущей поломкой.

## 7. Автоматические проверки

### 7.1. Worker

- Default off не добавляет canonical request.
- После origin-403 включённый relay выполняет только одну rescue попытку.
- 404 и успешный raw response не запускают relay.
- Fixed target, source query и отсутствие приватных forwarded headers проверяются.
- Reject redirect, 204, SVG, ложный MIME, повреждённая сигнатура и oversized body.
- Forbidden sources не вызывают сеть.
- Оставшиеся 100 мс бюджета дают timeout 100 мс, а не новые 2000 мс.
- Исчерпанный общий бюджет не вызывает relay.
- 12 widths одновременно используют одну source rescue.
- Source cache работает между widths и истекает через заданный TTL.
- HEAD пустой, R2 variant put не вызывается для relay.

### 7.2. Telegram

- Guest/non-owner отказ до Telegram fetch.
- Rate limit отказ до Telegram fetch.
- Owner получает private no-store.
- Missing credentials не вызывают сеть.
- URL mismatch, fresh error, backlog, historical error и network failure дают правильные состояния.
- Подставить токен в URL и raw error; сериализованный результат не содержит его.
- getWebhookInfo не выдаётся за проверку зарегистрированного секрета.

### 7.3. SEO

- Исполнить исправленный route handler на fixtures с u, цифрами и query.
- Сверить точные строки всех сформированных URL.
- Python XML checker различает валидную карту, повреждённую схему, пустую карту и malformed XML.
- Новые Node tests включить в CI/prebuild после базовых release/auth gates.
- Python test запускать в CI; не делать наличие Python обязательным для production build Next.js.
- Сохранить существующие media/security regression gates.
- Пройти TypeScript, ESLint и полный production build.

## 8. Приёмка SEO и анализ падения показов

1. Снять ошибки Search Console → Индексирование → Страницы за 3–5 октября.
2. Проверить Статистика сканирования → ошибки сервера/доступность хоста.
3. Для нескольких URL, потерявших показы, выполнить Проверку URL → Проверить опубликованную страницу.
4. Сравнить Google-selected canonical и declared canonical.
5. Проверить HTTP status, noindex и содержимое, которое получил Googlebot.
6. Убедиться, что после выпуска recent sitemap содержит точные HTTPS URL.
7. Повторно отправить исправленную карту в Search Console владельцем.
8. Не считать спад доказанной санкцией Google без данных Manual Actions/безопасности.
9. Не объяснять весь спад только sitemap: Google может обходить уже известные страницы и по внутренним ссылкам.
10. Сравнивать полные дни; изменение CTR не равно изменению числа показов.

Исправление карты и доступности не гарантирует немедленного возврата показов. Повторный обход и решение об индексации принадлежат поисковой системе.

## 9. Порядок выпуска

1. Выпустить PR #185 и подтвердить canonical callback/private no-store в production.
2. Слить данный зависимый PR в main и дождаться Railway build.
3. Проверить исправленный recent sitemap и owner Telegram health.
4. В Cloudflare открыть именно animebox-media → Edit code; заменить весь файл infra/cloudflare/media-worker.js и Deploy.
5. Сохранить существующее MEDIA_BUCKET binding → animebox-media.
6. Сначала проверить /health с relay выключенным: версия v6, поля доступны.
7. В animebox-media Settings → Variables добавить MEDIA_ORIGIN_RELAY_ENABLED как Variable со значением true.
8. Проверить реальные постеры, время и заголовки; успешный rescue отмечается origin-relay-fill/origin-relay-hit.
9. Если таймауты или нагрузка неприемлемы, отключить флаг, сохранив остальные исправления.
10. Не менять DNS, nameservers, основные app secrets и приложение Worker animebox для этого media-патча.

## 10. Откат

- Relay отключается удалением флага или установкой false; не требует отката Railway.
- Worker можно вернуть к предыдущей версии, сохранив R2 binding.
- Исправление sitemap не откатывать вместе с relay без отдельной причины: это независимый подтверждённый SEO-дефект.
- Telegram health read-only; зарегистрированный webhook этот endpoint не меняет.
- При кодовой регрессии использовать revert PR и повторную сборку.

## 11. Границы текущей проверки

- Реальный malformed recent XML и разница media/proxy подтверждены.
- Тестовый Worker выполняется в Node harness, а не Cloudflare production.
- Реальный canonical relay из рабочего окружения не уложился в 2 секунды; активация остаётся отдельной Cloudflare-приёмкой.
- Реальный getWebhookInfo с production bot token не выполнен: токена в рабочем окружении нет.
- Исторические HTTP-ошибки 3–5 октября, санкции Google и конкретное алгоритмическое обновление не подтверждены.
- Исправление recent sitemap не доказывает восстановление всех страниц в индексе.

Первичные источники:

- https://developers.google.com/search/docs/monitor-debug/debugging-search-traffic-drops
- https://developers.google.com/search/docs/crawling-indexing/site-move-no-url-changes
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview
- https://developers.cloudflare.com/workers/runtime-apis/fetch/
- https://core.telegram.org/bots/api#getwebhookinfo
