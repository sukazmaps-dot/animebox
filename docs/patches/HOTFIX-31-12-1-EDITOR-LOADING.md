# Hotfix 31.12.1 — восстановление загрузки профиля и Premium Studio

База: main b4e2ef53. Выпуск разрешён пользователем; дополнительный скриншот показывает зависшее Premium Studio внутри редактора.

## Причины

1. Восстановление сессии через getSession и загрузка profiles не имели общего предельного времени ожидания. Ошибка/ожидание SDK до fetch могли оставлять loading=true.
2. Studio и родитель одновременно запрашивали /api/profile/editor без дедупликации и deadline.
3. initialSettings часто приходит после mount. Старый эффект при появлении initialSettings немедленно возвращался, не переводя allowed из null. Ошибка локального запроса могла быть проигнорирована cleanup, и Studio оставалось на спиннере.

## Изменения

- Общий withLoadDeadline: 8 секунд на всю операцию (включая ожидание SDK и JSON), AbortSignal для транспорта, обработка reject и parent abort, очистка таймера/listener. Запоздалый результат не применяется.
- AuthStateProvider: bounded getSession/getUser, фоновое чтение profiles и Premium. Ошибка восстановления доступна через sessionError/retrySession, не выдаётся за выход из аккаунта. SIGNED_OUT и новые auth events отменяют применение устаревшего результата гидратации.
- Редактор: finally завершает loading, initial failure даёт повтор/выход, гостевой вход не зависит от вечного спиннера. Кеш текущего аккаунта сразу восстанавливает имя, описание, цвет, режим и тип баннера. При обновлении кеша изменённые пользователем поля сохраняются. Account ID и cleanup защищают от чужого/старого ответа.
- readProfileEditorAppearance: один in-flight GET на аккаунт для родителя и Studio, без кеша прав. Deadline включает чтение тела; по завершении запись удаляется, повтор действительно создаёт новый запрос.
- Studio принимает поздние initialSettings/initialAllowed один раз на аккаунт. Повторные props не стирают локальные правки. Ошибка сети не переводит пользователя в состояние «нет Premium»; есть явная ошибка и повтор. Существующие API проверки Premium остаются авторитетными.
- Новая регрессия исполняет настоящие AuthStateProvider, общий reader и эффекты editor/Studio; включена в editor-workspace:check, поэтому запускается в CI.

## Проверки

- Pending/rejected requests и SDK lock, timeout/abort, retry, late reply.
- Initial session → timeout → retry; sign-in после timeout; sign-out во время hydration; transient background failure сохраняет identity.
- Кеш внешности, несохранённое имя, смена аккаунта, cleanup.
- Dedupe двух одновременных читателей, несовпадение account ID, повтор после timeout.
- Studio: поздние props при pending fetch, игнорирование старого ответа, сохранение unsaved styles, ошибка без ложной потери Premium, retry success.
- TypeScript, ESLint, полный prebuild и build; существующая матрица браузерной геометрии в Quality Gate.
- После CI SUCCESS: merge и проверка обоих Railway production deployments до SUCCESS, затем браузерный smoke. Реальные загрузки медиа и платежи не инициировать.

Без миграций, изменения RLS/ключей/переменных, новых runtime зависимостей и изменений биллинга.
