# Hotfix 31.10.1 — Player dropdown stacking context

**Дата:** 2026-10-17  
**Приоритет:** P1 (просмотр серии, выбор озвучки)  
**Основание:** скриншот `/anime/sousou-no-frieren/episode/1` в Opera GX desktop.  
**База:** `main`, merge 31.10 `17ac4886f7e0f84f575db9f0d10e7aed20e0599a`  
**Ветка:** `fix/hotfix-31-10-1-player-dropdown-stack`

## 1. Пользовательский дефект

При раскрытии «Озвучка» список проваливается **под** следующую карточку навигации по эпизодам («Пред. / Серия / Следующая серия / Все серии») и другие последующие элементы. Часть вариантов оказывается визуально скрытой и недоступной указателю. При этом данные вариантов уже отображаются, поэтому это дефект наложения интерфейса, а не дефект получения переводов от Kodik/провайдера.

### Ожидаемый результат

- Меню при открытии отображается **над** соседним EpisodeQuickSelector и последующими карточками.
- Все видимые пункты в меню получают pointer hit (не навигация под ними), доступны для прокрутки и выбора.
- При закрытии возвращается обычная иерархия слоёв; навигация по сериям кликабельна.
- Никаких скачков геометрии, iframe remount/reload, принудительного закрытия fullscreen или изменения источника.
- Watch Together, theater, embedded, мобильный нативный `select`, светлая и тёмная темы сохраняют прежнее поведение.

## 2. Исследование первопричины

### Реальная структура страницы

```
AnimeEpisodePage
  ├─ AnimePlayer
  │  └─ div.relative.isolate.w-full      <-- создаёт stacking context
  │     └─ div (mount)
  │        └─ section.animebox-premium-player
  │           └─ div.animebox-player-header
  │              └─ div.animebox-player-toolbar
  │                 └─ div.premium-player-dropdown
  │                    ├─ button[aria-expanded]
  │                    ├─ select (small screens)
  │                    └─ div.absolute.z-50 (menu)
  ├─ nav.episode-quick-nav                <-- следующий DOM sibling
  └─ section.episode-engagement-grid
```

- Внешний `relative isolate` в `components/AnimePlayer.tsx` создаёт отдельный stacking context относительно навигации.
- Класс меню `z-50` не может выйти выше его **внешнего** контекста.
- Патч 31.10 поднимал лишь вложенные `.animebox-premium-player`, `.animebox-player-header` и `.premium-player-dropdown` по `:has(button[aria-expanded='true'])`, не внешний `relative isolate`. Поэтому при пересечении `EpisodeQuickSelector` мог перекрыть меню.
- Прежний smoke добавлял player section прямо внутрь page (не было внешних `relative isolate` + mount), так что тест не моделировал production-контекст и мог дать ложный PASS.

**Статус вывода:** подтверждён структурой React и CSS; фактическое перекрытие и pointer interception воспроизводятся через браузерный негативный контроль в Quality Gate. Если браузерная проверка не воспроизводит перекрытие, релиз блокируется и исследование продолжается.

## 3. Минимальный дизайн исправления

### 3.1. `components/AnimePlayer.tsx`

Добавить класс `animebox-player-root` **существующей** внешней обёртке:

```tsx
className={`animebox-player-root relative isolate w-full ${watchTogetherMode ? 'watch-together-player-root min-h-0' : ''} ${theaterMode ? 'z-[10001]' : ''}`}
```

Сохранить JSX, `isolate`, нативный `select`, существующие размеры, ключи, source dispatch, React state, event listeners, iframe identity и fullscreen state без изменений.

### 3.2. `components/EpisodePageDensity.module.css`

В существующем локальном владельце геометрии добавить после комментария об overlay:

```css
.page:global(.episode-page)
  :global(.animebox-player-root):has(
    :global(.premium-player-dropdown-trigger[aria-expanded='true'])
  ) {
  z-index: 30;
}
```

Никаких `!important`, новых глобальных селекторов или CSS-файлов. Не удалять `isolate` (изоляция требуется остальным слоям плеера). Не изменять общий `z-index` navigation и portal/modal. Существующие внутренние правила `z-index: 20/2/3` из 31.10 остаются — это отдельная иерархия **внутри** поднимаемого корня. Условие `:has` снимается автоматически при `aria-expanded=false`.

### 3.3. Почему не portal сейчас

Portal/Floating UI может в будущем устранить целый класс проблем overflow/viewport flip, но это более дорогой рефакторинг обработчиков outside click, scroll listeners, focus и позиций. Для одного маршрута горячее локальное исправление в существующей DOM-иерархии менее рискованно.

## 4. Автоматизированная проверка

**Владелец:** `scripts/mobile-player-shell-smoke.cjs`, уже входит в `npm run mobile-player-shell:browser` в Quality Gate.

- Fixture содержит тот же внешний `div.animebox-player-root.relative.isolate.w-full`, дополнительный mount, внутреннюю секцию плеера и *следующий* `EpisodeQuickSelector`.
- Источник JSX проверяется на наличие внешнего root с `relative isolate`, чтобы не допустить нового расхождения fixture с production.
- Fixture применяет реальный route-scoped `EpisodePageDensity.module.css` через PostCSS CSS Modules + текущие глобальные layout CSS; есть эквивалент Tailwind `.isolate{isolation:isolate}`.
- В **закрытом** состоянии computed z-index внешнего root равен `auto`.
- При раскрытом `aria-expanded=true` computed z-index равен `30`.
- Внешний root реально обладает `isolation:isolate`.
- Для ширин desktop/tablet меню позиционируется с геометрическим пересечением навигации, после чего в точке пересечения `document.elementFromPoint(x,y)` должен попадать **внутрь меню**, а не навигации.
- Негативный контроль ставит `root.style.zIndex='auto'` на открытом меню, имитируя старый production; в той же точке должен побеждать `EpisodeQuickSelector`. Негативный контроль обязателен, чтобы тест **действительно ловил** дефект.
- После снятия `aria-expanded` computed z-index возвращается к `auto` (без ожидания таймеров).
- Все существующие проверки аватарки, fullscreen 44×44, отсутствия overflow, одной навигации по сериям и мобильной компоновки остаются.
- Проверка выполняется на ширинах **360, 390, 430, 740, 844, 960, 1100, 1440, 1920 px**, с двумя zoom-значениями аватара. Desktop/tab сценарии проверяют pointer hit; телефоны — условное поднятие и восстановление корня (на реальных телефонах используется также native `select`).

### Полный Quality Gate перед merge

1. `npm run prebuild` (включает существующие серверные/архитектурные контракты).
2. `npx tsc --noEmit`.
3. ESLint затронутого TSX и скрипта по применимой конфигурации.
4. `npm run build`.
5. `npm run mobile-player-shell:browser`, `npm run player-fullscreen:browser` и другие имеющиеся browser smoke в Quality Gate.
6. GitHub Actions run должен закончиться в `success`, без новых провалов других кейсов.

CI Chromium browser fixture не заменяет тест на реальном устройстве.

## 5. Ручная приёмка (после merge + Railway деплоя)

На `/anime/sousou-no-frieren/episode/1` и ещё одном тайтле:

| Шаг | Условие успеха |
| --- | --- |
| Desktop Opera GX 1920×1080: раскрыть «Озвучка» | весь выпадающий список выше «Пред. / Серия / Следующая серия», варианты кликабельны |
| Открыть длинный список и скроллить | скролл именно внутри меню, карточка навигации не перехватывает мышь |
| Выбрать другую озвучку | выбор применяется по прежним правилам, нет нового незапланированного iframe remount |
| Закрыть меню кликом вне и Escape | подложка и навигация снова кликабельны, overlay не зависает |
| Выбрать серию и закрыть диалог | episode sheet/backdrop и focus сохраняют нормальную работу |
| 360/390/430px portrait; 740/844/960 landscape | нет X-overflow, нативный select доступен, элементы не перекрываются |
| Светлая/тёмная тема | контраст и состояние open/closed корректны |
| Theater/fullscreen | exit, iframe identity, z-order и восстановление положения страницы сохранены |
| Watch Together | независимая оболочка и выбор озвучки не затронуты |
| Telegram Android и iOS Safari | ручная приёмка отдельно; эти среды не эмулируются целиком в desktop Chromium |

## 6. Не затрагивать

- Логику Kodik/AniLiberty, source selection, трансляции, autoplay, next episode, opening skip.
- `usePlayerFullscreen`, fullscreen iframe, peer room, Watch Together и Premium theme.
- Supabase/RLS, миграции, ключи, переменные окружения.
- Sticky навигацию, стили общих карт, другие CSS-файлы с `!important`.

## 7. Риски и откат

- Теоретический риск: открытый dropdown на обычном маршруте окажется выше иного плавающего элемента этой же страницы. Снижается `:has` (только при открытом меню) и route scope.
- Прежняя модель popup в мобильном браузере зависит от native `select`; не менять её этим хотфиксом.
- CSS `:has` работает в современных Chromium/Opera GX; неподдерживающие движки получат прежнее наложение, но не сломают воспроизведение.
- При регрессии откатить PR/merge-коммит; данные и конфигурацию откатывать не требуется.

## 8. Release checklist

- [x] Минимально изменить TSX без iframe/state refactor.
- [x] В существующем CSS Module поднять внешний `isolate` при открытом меню.
- [x] Обновить browser fixture и добавить негативный контроль.
- [ ] GitHub Quality Gate успешен для final PR head.
- [ ] Review диффа без новых `!important` и без unrelated changes.
- [ ] Merge только после подтверждённых проверок.
- [ ] Railway: обе production-реплики `SUCCESS / Online` для release SHA.
- [ ] Реальный Opera GX / Android Telegram — визуальная приёмка после выката.
