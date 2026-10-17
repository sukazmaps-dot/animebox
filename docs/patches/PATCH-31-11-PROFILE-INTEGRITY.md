# Patch 31.11 — Profile Integrity: Save & Draft Persistence

**Дата:** 17 октября 2026
**Проект:** AnimeBox (Next.js App Router / React / Supabase / IndexedDB / Telegram Mini App)
**База:** main, финальный релиз `2fb8d8f63eb8bbb7dc57342ea2a0ea43732805aa`.
**Ветка:** `fix/patch-31-11-profile-integrity`.
**Риск:** сохранение пользовательских данных; **приоритет P0**.
**Release policy:** отдельный PR; никакого автоматического merge/deploy до CI SUCCESS и ручной проверки. БД, env, RLS и платёжные механизмы не менять.

## 1. Продуктовые инварианты

Пользователь открывает редактор и меняет имя, био, аватар, баннер, цвет, рамку и оформление. Все изменения остаются черновиком до явного Save; сравнение (Compare) должно показывать серверную версию без порчи draft. Потеря текста или файла, ложный статус `✓ Сохранено`, дублирующая публикация медиа и возрождение «несохранённого» черновика после успешного Save недопустимы.

Из истории уже реализованы: ProfileEditorViewport portal, компактный Discord-workspace (31.9), crop/normalization (30.9), responsive savebar (31.6), история Undo/Redo, IndexedDB с 7-дневным TTL. Этот патч **не** занимается финальной переделкой визуала (31.13), новым upload pipeline (31.12), дорогой оптимизацией SSR (31.14) и rate-limit API (31.15).

## 2. Подтверждённые исходниками риски

**2.1. React saving state не синхронный mutex.** В `ProfileEditorClient.saveProfile()` guard `editorBusy` строится из render-time `saving`. Два клика/Ctrl+S до следующего React render могут оба пройти, отправив двойной upload и POST. Решение: отдельный `useRef<boolean>` mutex, который устанавливается **синхронно после валидации** и снимается в `finally`.

**2.2. IndexedDB write/delete без сериализации.** `useProfileEditorHistory` ранее вызывал `profileDraftStorage(...,'write')` из debounce, pagehide/visibility и `'delete'` из Save/Discard независимо. Асинхронные транзакции могут завершиться в ином порядке; отложенный write после удаления восстанавливает уже сохранённый draft. Решение: per-user promise queue + revision invalidation, старые queued writes не выполняются после Save boundary; выполняющийся write заканчивается до следующего delete.

**2.3. Двойная очистка приватных загруженных файлов.** На `!response.ok` код удалял `pendingMedia`, затем бросал ошибку; общий `catch` повторял delete. Проблема: лишние запросы и возможная подмена основной ошибки ошибкой cleanup. Решение: cleanup только в одном catch; ошибки cleanup логировать, исходную ошибку показывать пользователю.

**2.4. Save button disabled недостаточно подробно.** Fieldset уже disabled при `editorBusy`, но самостоятельная кнопка Save вне fieldset не учитывала `Boolean(baseMediaEditor)`. Теперь Save также использует общий `editorBusy`, как форма.

## 3. Scope реализации

### 3.1. ProfileEditorClient.tsx

- Добавить `savingRef = useRef(false)`. При входе проверять `savingRef.current || editorBusy`.
- Валидация `usernamePolicyError` и `bio.length>300` остаётся перед захватом mutex, некорректный ввод не блокирует последующие попытки.
- Захватить lock перед первым `await uploadPrivateProfileMedia`; отпускать только в общем `finally`, включая ошибку одного из upload, API timeout и ошибку выбора рамки.
- Не менять order операций: stage avatar/banner → `/api/profile/editor` → sync auth/profile → `select_frame`. При отказе frame profile/media уже committed, повторная попытка должна сохранить только frame. Состояние `frameDirty` остаётся истинным.
- Удалить duplicate pendingMedia cleanup внутри `!response.ok`; обработать возможный reject cleanup так, чтобы он не затирал исходный текст ошибки.
- Save вне fieldset должен блокироваться при любом `editorBusy`, в том числе открытому crop dialog.
- Не менять серверную авторизацию, Premium entitlement, limits/Storage ACL, сертификаты и авторитетную модель сохранения.

### 3.2. profile-editor-draft.ts

- Экспорт `runProfileDraftOperation(userId, asyncOperation)`, являющийся **только** очередью выполнения, без собственных данных/файлов и TTL.
- Гарантия FIFO для одного userId; ошибка операции не блокирует следующие.
- Для разных userId операции независимы.
- Удалять запись о завершённой очереди из памяти после выполнения (никакого неограниченно растущего Map).
- `draftKey`, `ProfileDraftHistory`, `profileDraftStorage`, IndexedDB DB_NAME и TTL не менять.

### 3.3. useProfileEditorHistory.ts

- Использовать общую последовательную очередь для read/write/delete, вызовов debounce, pagehide, visibilitychange и явного discard.
- `storageRevision` инвалидирует операции записи из эпохи до Save/discard.
- `clearedDraft` сохраняет **идентичность конкретного старого snapshot** и не допускает его повторной записи из эффектов/cleanup после Save. Новая операция пользователя, даже если её содержимое совпадает с прежним черновиком, создаёт новый объект и сохраняется штатно.
- После новых осмысленных правок запись снова возможна.
- Recovery prompt, Restore, Undo/Redo, history checkpoint и staged File должны работать по прежнему контракту.
- Не обещать синхронного IndexedDB flush во время физического закрытия вкладки: браузер может прервать асинхронную операцию. Это best-effort с автосохранением во время обычного редактирования.

## 4. Регрессионная матрица

| ID | Сценарий | Ожидаемое |
|---|---|---|
| S1 | Двойной клик Save, затем Ctrl+S | Второй handler не начинает ни upload, ни POST |
| S2 | Ошибка валидации имени | Запрос не уходит, форма остаётся доступной |
| S3 | Ошибка upload аватара/баннера | Сохранённый профиль не испорчен, staged files остаются, редактор доступен |
| S4 | API 400/403/429/503 или таймаут | Ошибка показана, редактирование и retry доступны |
| S5 | Ошибка очистки private pending upload | Первоначальная ошибка сохранения не теряется |
| S6 | Save основного профиля успешен, frame POST неуспешен | Профиль считается сохранённым; frame остаётся dirty, можно повторить |
| D1 | Пишем черновик, длительная запись, затем Save/delete | Старый write не восстанавливает удалённый черновик |
| D2 | Новый edit после Save/delete, включая повтор тех же значений | Сохраняется уже новый черновик; подавляется только прежний snapshot |
| D3 | Ошибка IndexedDB записи | Очередь продолжает обслуживать следующие операции |
| D4 | Две учётные записи A/B | Черновики независимы |
| D5 | Перезагрузка при dirty | Recovery prompt, восстановление выбранных полей/файлов |
| D6 | Undo/Redo после восстановления | History сохраняет прежние правила, не меняет server до Save |
| UI1 | Crop editor открыт | Кнопка Save недоступна |
| UI2 | Мобильный 320/360/390/412/768 + desktop 1440/1920 | Нет блокировки dock, отсутствует горизонтальный overflow, длинная ошибка видна |
| UI3 | Telegram Back, выход, native keyboard | Предупреждение о несохранённых правках/безопасный выход |
| UI4 | Free/Premium/expired Premium | Entitlement применяется прежним образом; нет новых Premium обходов |

## 5. Automation / Quality Gate

- `tests/profile-integrity-31-11.cjs`: динамический unit per-user FIFO, failed operation recovery, account isolation; задержанный write в **настоящем React hook** с mocked IndexedDB; cleanup/redo/new-edit contract; исходные контракты Save.
- Подключить тест в **существующий** `editor-workspace:check`, который исполняется в `prebuild`, без нового каскада специальных CI workflow.
- Сохранить `tests/profile-editor-workspace.cjs`, `tests/profile-editor-navigation.cjs`, `tests/profile-editor-discord-workspace.cjs`, `scripts/profile-editor-unified-browser-smoke.cjs`, responsive/crop/file checks.
- Full GitHub Quality Gate (prebuild, TypeScript, ESLint, release Next.js build, Chromium smoke) должен пройти на точном head SHA.
- Отдельно проверить реальную Opera GX + Android Telegram Mini App (уведомления, клавиатура, viewport, файлы, Premium rights) — automation **не заменяет** эту ручную приёмку.

## 6. Ограничения и rollback

- Не внедрять авторизацию/идемпотентность на сервере в рамках клиентского хотфикса без отдельного ревью. Защита двух вызовов в одном mounted React instance не предотвращает повторение запросов из разных вкладок; полная exactly-once гарантия требует backend idempotency key.
- Не изменять при неизвестном результате POST cleanup/rollback семантику media transaction без отдельного patch 31.12.
- Не считать исправленными 503 Supabase RPC или потери при физическом аварийном закрытии браузера — это отдельные исследования.
- Откат: GitHub revert этого PR, Railway deploy из main; миграций и конфигурационных изменений нет.

## 7. Release criteria

- [x] Защита от двойного Save в компоненте.
- [x] Очередь IndexedDB операций и stale-write invalidation.
- [x] Единая очистка pendingMedia.
- [x] Консистентная disabled-кнопка Save при media editor.
- [x] Динамический новый тест включён в существующий prebuild.
- [ ] GitHub Actions Quality Gate SUCCESS.
- [ ] Проверена реальная сессия free/Premium/expired на устройстве.
- [ ] Merge/deploy после отдельного подтверждения релиза.
