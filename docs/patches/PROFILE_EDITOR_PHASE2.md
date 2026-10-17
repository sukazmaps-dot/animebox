# Редактор профиля: фаза 2, единая страница

## Цель и границы

Вместо четырёх взаимоисключающих вкладок пользователь получает один раздел «Профиль» с тремя карточками. Визуальная модель похожа на редактор Discord; существующие механизмы сохранения и Premium остаются владельцами данных. Работа основана на main b3151dc8.

Изменяются ProfileEditorClient.tsx, ProfileDirectEditSurface.tsx, ProfileEditorLivePreview.tsx, app/profile/edit/page.tsx, app/profile-editor-v13.css, ProfileDirectEditSurface.module.css. Добавляются useProfileEditorAnchors.ts и profile-editor-navigation.ts. Отдельно обновляются проверки и добавляется браузерная fixture.

## Порядок реализации

1. Зафиксировать зависимости строковых тестов и совместимость URL.
2. Заменить четыре условных инспектора одним постоянно смонтированным компонентом с тремя карточками.
3. Сократить навигацию, объединить dirty для Profile, добавить якоря и переходы из превью.
4. Проверить типы, линтер, полный prebuild, production build и браузерную геометрию на заданных ширинах.

## Поведение и критерии приёмки

### Структура

1. Верхний уровень содержит ровно четыре назначения: Профиль, Оформление, Витрина, Награды. Пункта «Ещё» и отдельных навигационных вкладок Аватар/Баннер/Рамка нет.
2. При ширине от 1180 px навигация расположена слева; 900–1179 px — в верхней горизонтальной панели; до 900 px — в нижнем доке. Превью справа появляется от 900 px, на телефоне остаётся сверху.
3. Контент ограничен 1400 px и центрирован. Колонки используют minmax(0, …), содержимое не расширяет страницу.
4. В Profile одновременно присутствуют карточки «Имя и описание», «Аватар и рамка», «Баннер» именно в этом порядке. Инвентарь рамок расположен внутри второй карточки, после управления аватаром.
5. Карточки имеют обычную высоту по содержимому. Бывший inspector не создаёт внутреннюю прокрутку, не ограничен max-height и не закрепляется отдельно. Единственный scroll owner — .profile-editor-v13.
6. ProfileDirectEditSurface создаётся один раз и скрывается через hidden при уходе из Profile. Выбор фильтра рамок, режим баннера и инвентарь не теряются при смене раздела.

### Якоря и навигация

7. Чипы: Имя → name; Аватар → avatar; Баннер → banner; Рамка → frame. Frame — вложенная секция второй карточки, а не четвёртая карточка.
8. Все цели имеют постоянные id profile-editor-{name,avatar,banner,frame} и data-profile-anchor. Превью связывается с ними через aria-controls.
9. Чипы закреплены ниже шапки и мобильного превью. На промежуточном десктопном диапазоне учитывается также верхняя панель навигации.
10. Размеры измеряются ResizeObserver; скролл обрабатывается пассивным слушателем, обновление ограничено requestAnimationFrame. На unmount/выходе из Profile наблюдатели, слушатели и RAF освобождаются.
11. Клик прокручивает корневой контейнер, не вызывает focus и не открывает клавиатуру/файловый диалог. Обычный режим — smooth; prefers-reduced-motion — auto. Первоначальный deep link прокручивается без анимации.
12. Scroll-spy подсвечивает текущую секцию через aria-current="location". В конце страницы активен последний якорь, даже если короткая последняя карточка не может достичь верхнего порога.
13. При входе на обычный /profile/edit автоматическая прокрутка к имени не нужна. Отмена StrictMode-эффекта до RAF не должна терять первоначальную прокрутку legacy URL.
14. Клик по баннеру/аватару/имени в превью ведёт к соответствующей карточке. Из другого раздела сначала открывается Profile; внутри Profile лишнего сброса scrollTop к нулю нет. Открытое расширенное превью закрывается.

### Совместимость и данные

15. ?tab=avatar, ?tab=banner, ?tab=frame преобразуются в initialTab="profile" плюс соответствующий initialAnchor. Нормализация клиента тоже возвращает Profile для старых имён вкладок.
16. Сохраняются aliases premium/style, widgets/showcase, awards/rewards, appearance/media. Неизвестный tab открывает Profile.
17. Изменения имени, био, аватара, баннера или рамки зажигают общий dirty-маркер Profile. Изменения Premium по-прежнему относятся к Оформлению. Независимое сохранение Витрины/Наград не меняется.
18. Запрос GET /api/community/leaderboard-rewards выполняется одним экземпляром компонента. In-flight Promise хранится в ref и используется повторно при StrictMode effect replay. После завершения ref освобождается; события получения награды/смены косметики могут намеренно обновить инвентарь.
19. Выбор рамки только меняет черновик; серверное сохранение остаётся в общем Save. Запросы загрузки медиа, compress/crop, Premium-проверки и payload сохранения не переписаны.
20. useProfileEditorHistory, IndexedDB, Compare, Ctrl+Z/Ctrl+S, recovery, undo/redo и beforeunload сохраняют существующие контракты. Навигация не пересоздаёт весь workspace и не меняет пользовательский key.
21. При изменении URL через history сохраняется window.history.state, включая служебное состояние App Router.
22. Сохраняются profile-editor-v13, profile-editor-v13__shell, profile-editor-v18__savebar, data-editor-tab, data-visible="true", data-editor-save. Значение data-editor-tab для старых ссылок теперь profile.

### CSS и доступность

23. Новые правила не используют !important. Размер shell и мобильная сетка изменены в существующем владельце геометрии; старые правила меню «Ещё» удалены.
24. Кнопки карточек и якорей имеют цель минимум 44×44 px. На телефонах до 430 px палитра переходит в четыре колонки, эффекты заливки — в две; общий горизонтальный скролл отсутствует.
25. Запрещённые type="color" и autoFocus в имени/био отсутствуют. BannerColorSheet и пипетка сохранены.
26. Нижние отступы остаются под управлением observeProfileEditorDock: высота savebar, нижнего меню, safe-area и клавиатуры не заменяются фиксированными числами.
27. Активные чипы различимы цветом и границей; клавиатурный focus-visible имеет контур. Reduced motion исключает плавную программную прокрутку.

## Проверки исходников: точные новые строки

### tests/profile-editor-v312.cjs

Вместо проверки inspectorRef.current?.scrollIntoView:

```js
assert(direct.includes('data-profile-anchor="banner"'));
assert(read('hooks/useProfileEditorAnchors.ts').includes('root.scrollTo({ top: root.scrollTop'));
```

### tests/profile-editor-v313.cjs

Список верхних разделов и новые ограничения:

```js
for(const section of ["'profile'","'style'","'showcase'","'rewards'"])
  assert(root.includes(section),'Missing editor section '+section);
assert(!root.includes('<details className="profile-editor-v31__more"'));
assert(root.includes("hidden={activeTab !== 'profile'}"));
assert(!direct.includes('autoFocus'));
for(const anchor of ['name','avatar','banner','frame']) assert(direct.includes(`data-profile-anchor="${anchor}"`));
```

### scripts/profile-editor-responsive-smoke.cjs

Навигация без details, матрица и ограничение ширины:

```js
const nav=`<nav class="profile-editor-v13__tabs profile-editor-v18__rail" aria-label="Разделы">${['profile','style','showcase','rewards'].map(s=>`<button data-section="${s}"><svg width="17" height="17"></svg><span>${s}</span></button>`).join('')}</nav>`;
for(const theme of ['dark','light'])for(const tab of ['profile','style'])for(const [width,height] of [[320,900],[390,900],[560,900],[768,900],[900,900],[1180,900],[1440,900],[1920,1080]]){
// тело проверок сохраняется
}
if(width>=1440)assert(geometry.settings.width>500,label+' use wide screen');
```

Порог 600 заменён на 500, поскольку 1400 px делятся между меню 180 px, превью до 380 px, gaps и внутренними отступами. Проверки containment, sticky, дока и IndexedDB сохранены.

### Дополнительно найденные старые контракты

scripts/profile-showcase-editor-check.mjs:

```js
['Profile Studio rewards tab', editorShell, "['rewards','Награды','trophy']"],
if (!editorShell.includes("type EditorTab = 'profile' | 'style' | 'showcase' | 'rewards'") || !editorShell.includes("'frame'")) {
  failures.push('Profile Studio Direct Edit tab contract regressed.');
}
```

scripts/patch-18-8-product-final-check.mjs:

```js
"type EditorTab = 'profile' | 'style' | 'showcase' | 'rewards'",
if (!editor.includes("['showcase','Витрина','image']") || !editor.includes("['rewards','Награды','trophy']")) {
  failures.push('Profile Studio missing accessible Showcase/Rewards entry in the editor');
}
```

Это замены старых архитектурных ожиданий, а не удаление проверок сохранения/Premium. Новый tests/profile-editor-navigation.cjs исполняет реальную серверную страницу с legacy aliases и подключён к editor-workspace:check. Новый scripts/profile-editor-unified-browser-smoke.cjs монтирует реальные Surface/Preview/hook, проверяет три карточки, якоря, StrictMode, один запрос рамок и размер целей. Только графическое наложение рамки заменено заглушкой; полный API save/crop этим smoke не тестируется.

## Команды воспроизведения

```sh
npm run prebuild
npm run patch31-2:check
npm run patch31-3:check
npx tsc --noEmit
npx next build
CHROMIUM_PATH=/path/to/chromium npm run editor-workspace:browser
ESBUILD_MODULE_PATH=/path/to/esbuild CHROMIUM_PATH=/path/to/chromium npm run editor-unified:browser
```

Browser smoke использует отдельно установленные Playwright и esbuild; они не добавлены в runtime-зависимости приложения. PLAYWRIGHT_MODULE_PATH позволяет указать внешний модуль. Тестовый origin перехватывается локальной fixture, реальные аккаунты и данные не изменяются.

## Результаты

- Полный prebuild пройден; source checks 31.2/31.3 пройдены отдельно.
- TypeScript и production build пройдены. Для сборки потребовался новый локальный кэш Turbopack: старый не открывался с ошибкой persistence directory / invalid digit. Это не миграция проекта.
- ESLint изменённых компонентов и hook: 0 ошибок; остаются существующие предупреждения img/exhaustive-deps.
- Responsive smoke: 32 случая, обе темы × Profile/Style × все восемь ширин; док, sticky, HEX containment, клавиатура и IndexedDB.
- Реальные React-компоненты: восемь ширин; цели 44 px, scroll-spy, preview navigation, legacy links, reduced motion, StrictMode и один GET рамок.
- Потребуются проверки реального аккаунта и физических устройств ниже; браузерная fixture не заменяет их.

## Ручной чек-лист

На телефоне / Telegram Android / iOS:

- Открыть /profile/edit: четыре нижних раздела, три карточки, нет горизонтальной прокрутки. Повторить на 320/390/560 px, включая длинные имя и био.
- Пройти все чипы и кликнуть аватар/баннер/имя превью. Карточка не закрыта шапкой, активный чип меняется при ручном скролле; в конце активен Баннер.
- Открыть старые ссылки tab=avatar/banner/frame; убедиться, что показан Profile и нужная карточка, клавиатура сама не открывается.
- Изменить имя, био, цвет, рамку; dirty появляется на Profile. Перейти в Оформление и обратно — правки и режим карточки сохранены, лишнего GET рамок нет.
- Открыть клавиатуру, цветовую панель и обрезку; последний контрол и Save доступны, safe-area соблюдена. Выбрать/отменить фото без потери остального черновика.
- Обновить страницу и восстановить IndexedDB-черновик. Проверить Compare, Reset, Undo/Redo, сохранение, ошибку сети и предупреждение при уходе.
- Проверить бесплатный аккаунт, активный Premium и истёкший Premium: обычное сохранение не блокируется неизменённым старым Premium-оформлением.

На ПК (768/900/1180/1440/1920 px):

- На 900 px верхнее меню не пересекается с чипами. От 1180 px меню слева, форма в центре, sticky-превью справа. На 1920 px shell не шире 1400 px.
- Вращать колесо над инвентарём и превью: нет отдельной ловушки прокрутки. Последняя настройка доступна над доком.
- Проверить Tab/Shift+Tab и focus-visible; Ctrl+S, Ctrl+Z и redo; удержание Compare; уменьшение анимации в ОС.
- Сохранить изменения всех трёх карточек одной кнопкой, открыть публичный профиль и проверить результат. Проверить отдельные экраны Витрины и Наград.

Миграции БД, переменные Cloudflare/Railway и изменение медиа-origin для этой фазы не нужны.

## Совместимость с присланной фазой 1

Из profile-editor-phase1.patch перенесены max-width:360px для сетки цветов и перенос кнопки расширения под десктопное превью (от 900 px). Повторный слой max-width:1400px не добавлялся: это ограничение уже задано владельцем shell. Мобильные четыре колонки и цели 44 px сохранены. Браузерная fixture дополнена настоящей кнопкой расширения и проверкой её расположения ниже карточки на ПК.
