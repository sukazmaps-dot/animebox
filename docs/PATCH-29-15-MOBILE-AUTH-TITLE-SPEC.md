# Patch 29.15 — мобильное окно входа и читаемая страница аниме

Дата: 15.10.2026. База: main `7b6f5d7c30033ffbe9de43d67a66eed03390c33e`.
Ветка: `fix/patch29-15-mobile-auth-layout`.

## 1. Цель

Закрыть оставшиеся проблемы со скриншотов 14 октября после выпуска #226:
обрезанную шапку входа/регистрации, тёмную завесу на светлой странице аниме
и пустое пространство в hero без широкого баннера. Проверить расположение
кнопок избранного/трекера и не возвращать уже исправленные наложения описания.

Результат для пользователя: форма целиком доступна прокруткой даже при маленькой
высоте окна; закрытие всегда на виду; фон и текст соответствуют выбранной теме;
при отсутствии баннера постер и название используют верх hero совместно.

## 2. Источники и границы достоверности

- Screenshot_20261014_163610_Chrome.png: рекламный заголовок входа обрезан сверху
  формы; компактная область story не вмещает своё содержимое.
- Screenshot_20261014_163621_Chrome.png: в регистрации видна обрезанная часть
  логотипа; прокрутка формы не должна прокручивать/обрезать кнопку закрытия.
- Screenshot_20261014_163346_Chrome.png: светлая тема, тёмный линейный градиент
  перекрывает изображение и лежит под тёмным текстом; тёмные подписи малочитаемы.
- Screenshot_20261014_164217_Chrome.png: без banner постер справа занимает
  отдельный верхний этаж, слева пустота; favorite и plus визуально разнесены.
- Скриншоты домашней пагинации и активной mobile nav относятся к уже выпущенным
  #224–#226. Их исправления не повторять, проверять существующими regressions.

Скриншот фиксирует предыдущий выпуск. Каждую проблему нужно сопоставить с текущим
CSS/DOM; ранее исправленное не объявлять новым найденным дефектом. В частности,
причину расстояния между icon actions установить измерением; не приписывать её
непроверенному justify-content. Геометрию и тему проверять на реальном каскаде.

## 3. Подтверждённые исходные причины

### 3.1. Окно авторизации

`auth-modal-v2__dialog` — grid с ограниченной высотой и overflow:auto; на телефоне
в нём два вертикальных блока story/form. У story overflow:hidden, контент содержит
бренд, второй рекламный заголовок и абзац перед собственным заголовком формы.
При большой форме первая grid-строка сжимается и скрывает кусок текста/логотипа.
Кнопка закрытия position:fixed также взаимодействует с transform-анимацией dialog.

### 3.2. Тема страницы аниме

В `detail-layout.module.css` overlay содержит фиксированный `rgb(17 16 22 / ...)`
для всех тем. В `AnimeDetailControls.module.css` обычные круглые кнопки имеют
фиксированную тёмную подложку, а основной CTA использует обычный --ab-ui-text
на фиолетовой заливке. В светлой теме CTA должен брать --ab-ui-primary-text.

### 3.3. Hero без banner

Мобильный poster абсолютный: top 20px, ширина 100px. `withPoster .heroContent`
резервирует сверху 186px на всю ширину. Поэтому место слева от постера не занято.
Сократить это пространство нужно отдельно для poster fallback, сохранив медиа
баннерного hero и естественную высоту длинного названия.

## 4. Авторизация — требования к мобильной компоновке

1. До 760px dialog — одна колонка и две явные строки: компактная шапка и
   `minmax(0,1fr)` для прокручиваемой формы.
2. В шапке только логотип/ANIMEBOX и доступная кнопка закрытия, без обрезанного
   дублирующего рекламного заголовка. Desktop story остаётся отдельной колонкой.
3. Высота dialog определяется доступной высотой overlay, min-height:0.
4. Переполнение обрабатывает только form-side. Шапка не сжимается из-за формы.
5. Login/register, social buttons, email/password, подтверждение, ошибка и legal
   доступны в потоке. До submit можно докрутить на 320×568 и в landscape.
6. Учитывать safe-area сверху/снизу, не прижимать поля к краям.
7. Кнопка закрытия >=44×44 CSS px, не пересекается с логотипом или tabs.
8. Вкладки, submit и поля не выходят за правый край при ширине 320px.
9. input font-size на мобильном >=16px для предсказуемого масштабирования.
10. Длинное сообщение ошибки переносится, не расширяет dialog.
11. Header/divider/subtitle используют общие --ab-ui-* цвета. Текст обычных
    кнопок на primary берёт --ab-ui-primary-text, focus остаётся видимым.
12. Desktop 1024/1440 сохраняет story и две колонки. При коротком landscape
    допустима мобильная компоновка, если иначе внутренние колонки не помещаются.

## 5. Высота клавиатуры и жизненный цикл

1. Внутри AuthModal измерять `window.visualViewport.height/offsetTop`, с fallback
   на window.innerHeight и нулевой offset.
2. Передавать значения через custom properties только текущего overlay.
3. Подписаться на viewport resize/scroll и window resize; использовать rAF для
   объединения измерений в один кадр, без React setState на каждое движение.
4. Очистить listeners и ожидающий rAF при закрытии. Не оставлять свойства на html.
5. При уменьшении доступной высоты header остаётся видимым, форма уменьшается и
   прокручивается. Нельзя лечить keyboard bug общим overflow:hidden на форме.
6. Нативная мобильная клавиатура проверяется отдельно: программное уменьшение
   viewport и mocked visualViewport не являются аппаратным тестом Android/iOS.
7. Сохранить Escape, focus trap, body scroll lock и existing submit logic.
8. Восстановить фокус на вызвавшем элементе после закрытия, если он ещё в DOM.
9. Открытие и смена login/register не отправляют запрос логина и не создают аккаунт.
10. Не менять OAuth URL, emailAuthRequest, redirect/next, CSRF, cookie, Supabase,
    Telegram autologin, account state или уведомления.

## 6. Страница аниме — палитра и контраст

1. Overlay формируется из --ab-ui-surface/--cinema-bg и прозрачности, а не
   фиксированной чёрной краски. Палитра меняется вместе с темой.
2. На телефоне верх изображения виден, а к началу фактов/действий фон становится
   достаточно плотной тематической подложкой; ниже описание идёт по surface.
3. Для варианта без баннера overlay не должен затемнять пустой poster hero.
4. CTA: primary фон + primary-text. Обычные icon actions: тематическая raised
   подложка и border. Focus использует тематический accent вместо белого.
5. Полоса resume использует border token, подписи — muted. Проценты не менять.
6. Значимые тексты и обычные кнопки >=4.5:1 на их фактическом фоне; декоративные
   контрастные границы не подменяют читаемость текста.
7. Desktop и mobile работают с одним набором токенов без отдельной белой заплатки.

## 7. Hero без широкого баннера

1. На телефоне поднять identity к верхнему краю рядом с постером.
2. Зарезервировать справа только ширину постера и зазор; название слева может
   расти по высоте. Следующие факты/кнопки занимают всю доступную ширину.
3. Постер уменьшить до 84px (2:3), зарезервированная высота identity >=126px.
4. Верх identity отстоит от hero на ~20px, вместо прежних 186px.
5. Длинный рус./латинский заголовок и непрерывный токен не перекрывают постер.
6. При увеличении текста hero растёт, текст не обрезается фиксированным height.
7. Banner-вариант не получает эти правила. Desktop poster-вариант сохраняет
   отдельный постер справа и ограничение текстовой колонки.
8. Медиаисточники, hotlink fallback, eager priority, SEO и metadata не менять.

## 8. Actions / synopsis

- Основная кнопка на mobile — отдельная полная строка, >=48px.
- Favorite и tracker идут рядом в следующей строке, каждый 48×48px, зазор <=16px.
- Для saved состояния текст может занять отдельную строку; resume остаётся ниже.
- Описание начинается после полной высоты actions и resume, зазор положительный.
- Проверить guest, saved, resume, error; disabled watch и длинный unavailable text.
- Если текущий каскад уже держит кнопки рядом, добавить regression и не менять
  поведение на основании только старого скриншота.

## 9. Матрица и уровни проверки

| Набор | Размеры и состояния | Что доказывает |
| --- | --- | --- |
| Гидратированная форма | 320×568,390×844,768×1024,844×390,1024×768,1440×900; dark/light; login/register | настоящий AuthModalProvider из production build, открытие, mode, scroll, Escape, focus restore |
| Viewport lifecycle | уменьшение высоты и offsetTop, закрытие и повторное открытие | scoped CSS variables и очищенный viewport subscription |
| Cinematic CSS | 320–1920; dark/light; normal/125% text; guest/saved/resume/error | source-equivalent DOM, реальные CSS Modules + глобальные route styles |
| Палитра | CTA, muted, icon controls, gradient | computed values и contrast на theme surface |
| Существующие | route-layout, editor dock, settings guest, hero pagination, cascade | сохранность уже выпущенных исправлений |

Для dynamic anime layout не обещать полноценный SSR/player E2E. Для auth
использовать built гостевую страницу /settings и реальные JS chunks, перехватив
сетевые вызовы в offline test. Не нажимать Google/Telegram, не вводить реальный
email, не отправлять форму и не менять пользовательские данные.

## 10. Файлы и владение

- components/AuthModalProvider.tsx: компактный header, viewport lifecycle, focus.
- components/useDialogViewport.ts: подписки только при mount открытого dialog,
  cleanup listener/RAF. Root runtime budget остаётся 35; отдельный guard проверяет
  условный mount и максимум 3 очищаемые подписки этого хука.
- app/auth-modal-v2.css: scroll model, mobile sizing, responsive layout.
- app/patch16-quiet-interactions.css: удалить конфликтующие responsive overrides
  только там, где они перекрывают owning auth stylesheet.
- app/anime/[slug]/detail-layout.module.css: gradient, fallback poster/identity.
- components/AnimeDetailControls.module.css: тематические controls/resume.
- scripts/auth-modal-layout-smoke.cjs: built-page hydration + geometry assertions.
- scripts/anime-detail-layout-smoke.mjs: расширить существующую матрицу, не
  создавать параллельную копию того же cinematic test.
- .github/workflows/animebox-quality.yml: обязательный auth browser smoke после build.

## 11. Приёмка и выпуск

1. Подробное ТЗ сохранено в docs; каждое изменение связано с причиной.
2. Сборка проходит существующий полный prebuild, TypeScript и scoped ESLint.
3. Auth browser smoke и расширенный cinematic smoke зелёные.
4. Основные старые UI regressions зелёные, нет новых root CSS imports/dependencies.
5. PR создан от последнего main, GitHub Quality Gate SUCCESS для head SHA.
6. В PR указать реальные результаты, fixtures и ограничения keyboard/device QA.
7. Слияние и deployment — отдельные состояния. Не объявлять готовность на сайте
   по одному локальному build или созданному PR.
8. При выпуске подтвердить primary blissful-mercy SUCCESS для merge SHA,
   публичные HTTP routes, затем read-only браузерный smoke.

## 12. Исключения и откат

Backend/auth/security integration, БД, история рейтингов, медиа/R2, поиск,
Kodik, маркетинг и новые функции не входят в патч. Скриншоты с account данными
используются только для внутренней проверки, не включаются в PR/артефакты.
Откат обычным revert PR + новым deployment, без SQL и force push main.

## 13. Реализация и локальные результаты

- Production build с полным prebuild: exit 0. TypeScript и scoped ESLint: exit 0.
- Auth security invariants: PASS; API/redirect/credential code не менялись.
- Root runtime budget сохранён: 35 listener sites. Новый хук условно монтируется
  только открытым AuthModal, его cleanup проверяется статически и в Chromium.
- Гидратированный auth smoke: 24 комбинации (6 размеров × 2 темы × 2 режима),
  плюс height=350/offsetTop=80, закрытие, повторное открытие и cleanup подписок.
- Контраст выбранной вкладки проверен на двух крайних цветах её прозрачного
  gradient поверх фактических подложек; submit — на собственном primary фоне.
- Cinematic smoke: 320 комбинаций, banner/poster, normal/125% text, 4 состояния,
  непрерывный длинный заголовок, соседние icons, synopsis flow, CTA >=4.5:1.
- Имеющиеся сценарии: route-layout 96, hero pagination 72, settings hydration 2,
  CSS cascade 22, palette/Premium 4, editor dock 16 — PASS.
- Просмотрены внутренние QA изображения 390px: auth login/register в обеих темах,
  cinematic banner в light и fallback poster в dark.
- Настоящий Google widget намеренно недоступен в offline smoke; проверяется
  приложение и layout при loading/fallback провайдера, не Google sign-in.
- Локально Node 24 / Chromium 153; обязательный GitHub CI отдельно проверяет
  Node 22 / Playwright 1.62.1. Нативная клавиатура Android/iOS не проверялась.
- База main на момент подготовки PR: `7b6f5d7c30033ffbe9de43d67a66eed03390c33e`.
