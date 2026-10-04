# AnimeBox — тестовая миграция на Cloudflare Workers

Подготовлен патч, а не готовый опубликованный сайт. Домен не переключался.

## Что проверено

Next.js 16.3.8, @opennextjs/cloudflare 1.20.8, Wrangler 4.125.0.
Прошли существующие prebuild проверки, production Next/OpenNext сборка,
TypeScript, тесты разделения маршрутов и cron авторизации.
Все 11 Workers укладываются в 3072 KiB gzip: подробности в cloudflare/size-report.json.
Максимальный пакет pages_watch: 2464.70 KiB, основной: 1969.61 KiB.
Локальный workerd запустил Workers и проверил:
- /login: 200;
- /api/watch-party/health: 200 и no-store;
- /api/admin/users и /api/profile/editor без авторизации: 401;
- GET /api/auth/email: 405;
- POST с чужим Origin: 403.

Размер проверен, но бесплатная работа всего сайта НЕ гарантирована.
Free ограничивает CPU запроса и общее число запросов аккаунта. Разделение
не устраняет расход CPU Next.js; особенно важны страницы просмотра и OG картинки.
Локальные проверки не измеряют CPU продакшена. Реального деплоя не было.
Вход с учётной записью, плеер, создание WT комнат и платёжные сценарии
потребуют проверки на тестовом адресе. Не переключайте DNS до этих проверок.
R2 имеет собственные квоты и условия подключения: не считайте его безусловно
бесплатным для любого объёма. Этот патч не включает платный тариф автоматически.

## Установка патча в Windows CMD

Архив содержит только новые и изменённые файлы. Распакуйте его в корень
C:\Users\Homie\Downloads\animebox-git с заменой. Исходники и .env.local оставьте.

    cd /d C:\Users\Homie\Downloads\animebox-git
    git switch -c migration/cloudflare-test
    npm ci
    npm run cf:build

cf:build запускает существующий prebuild, Next build, создание групп,
OpenNext и проверку всех размеров. При превышении лимита он завершается с ошибкой.
После любого изменения приложения выполняйте полную cf:build.
cf:build работает на Windows и Linux. Рекомендуемая версия Node: 22.

## Первый тестовый деплой — вручную

Не используйте Deploy из прежней формы Cloudflare до настройки проекта.
В аккаунте должен отсутствовать существующий рабочий Worker с именем animebox:
bootstrap создаёт временный ответ 503 под этим именем и заменит его, если он существует.
Выберите другой префикс во всех конфигурациях, если имя уже занято.

1. Авторизуйтесь: npx wrangler login.
2. Создайте приватный R2 bucket animebox-next-cache: npx wrangler r2 bucket create animebox-next-cache.
3. Один раз выполните npm run cf:bootstrap для НОВОГО тестового Worker.
4. Выполните npm run cf:deploy. Команда проверит размеры, загрузит build cache
   в R2, опубликует десять закрытых серверных Workers, затем шлюз animebox.
5. Выполните npm run cf:secrets. Команда читает локальный .env.local и переносит
   переменные приложения во все Workers через Wrangler, без вывода значений.
   Служебные VERCEL*, Cloudflare credentials, SQLite path и старый секрет
   Cloudflare -> Vercel исключаются. Не отправляйте .env.local в GitHub или чат.
6. Откройте workers.dev адрес, который напечатает Wrangler. Проверьте сайт,
   auth callback URLs, вход, поиск, карточки аниме, плеер, WT и личный кабинет.
   Проверьте CPU/errors в Cloudflare прежде чем считать Free пригодным.

NEXT_PUBLIC_* требуются при сборке; остальные серверные переменные — в Secrets
каждого Worker. Если меняется публичный URL приложения, задайте его до cf:build
и проверьте разрешённые адреса возврата у провайдера авторизации.
cf:secrets повторно выполняется при изменении .env.local.
Cron в тестовом режиме выключен (ANIMEBOX_CRON_ENABLED=false).

Для локальной проверки: npm run cf:preview. Проверка runtime без браузера:
 npm run cf:runtime-check (нужен .env.local и завершённая cf:build).
Локальное preview не является измерением CPU тарифного плана.

## Автоматическая сборка в Cloudflare

После успешного ручного деплоя и переноса секретов можно подключить ветку:
Build command: npm run cf:build
Deploy command: npm run cf:deploy
Root: корень репозитория; NODE_VERSION=22.
Preview builds пока отключить: конфигурация рассчитана на одну тестовую среду.
NEXT_PUBLIC_* добавьте в build environment. Runtime Secrets сохраняйте в Workers.
Не используйте opennextjs-cloudflare deploy/preview для всего проекта:
они рассчитаны на один сервер. cf:* команды здесь обрабатывают все части.

Патч добавляет временные исправления сборщика строго для версии 1.20.8:
обработка каждого server-function, scope OG traces и manifests.
Изменения в node_modules восстанавливаются после сборки; при смене версии
адаптера скрипт остановится. Node middleware у адаптера experimental.
Не обновляйте адаптер без повторной проверки.

## Что осталось до переноса основного домена

Текущий deploy последовательный, не атомарный. Service bindings не закреплены
за версиями; автоматическая skew protection адаптера не применяется к split.
Для production требуется стратегия согласованного обновления всех частей
и старых браузерных вкладок. Этот пакет предназначен для тестовой миграции.

Текущая защита production host в proxy.ts привязана к VERCEL_ENV.
На тестовом Workers она не включается. Перед основным доменом нужно адаптировать
production host policy и закрыть альтернативный workers.dev адрес, сохранив
проверки Origin и авторизации. Не копируйте VERCEL_ENV=production как обходной путь.

Cron переносится через шлюз, требует CRON_SECRET. Включать его только после
проверки задач и остановки старых Vercel cron, чтобы избежать двойных запусков.
В старом vercel.json расписания сохранены: это облегчает возврат на Vercel.
SQLite реестр заменяется существующим stateless режимом; постоянные данные
приложения продолжают храниться в прежней внешней БД.

## Файлы

cloudflare/gateway.mjs — middleware, маршрутизация и cron.
cloudflare/generated — закрытые server Workers, без публичных workers.dev URLs.
cloudflare/route-groups.mjs и split-routes.json — назначение всех 214 маршрутов,
включая динамические OG/twitter metadata.
scripts/cloudflare-*.mjs — сборка, проверки, публикация и перенос env.
lib/anime-registry.ts — lazy SQLite только для Node и stateless Workers режим.
public/_headers — immutable cache для версионированных Next assets.
Секреты, node_modules и результаты сборки в архив не входят.
