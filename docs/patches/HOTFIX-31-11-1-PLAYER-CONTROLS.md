# Hotfix 31.11.1 — player fullscreen ownership & episode mobile controls

**Дата:** 17 октября 2026
**Priority:** P1, viewing flow / mobile usability
**Исходный production SHA:** `ddbab4a7f8ccea35e60ae295d3eb3fa83a6feb0e`
**Branch:** `fix/hotfix-31-11-1-player-control-density`

## Исходная проблема

Пользователь показал 4 скриншота (desktop video, увеличение правой нижней части iframe, DevTools phone 360–390 px и крупный план nav). На обычном Kodik iframe дополнительный оверлей AnimeBox с иконкой fullscreen появляется над/рядом со встроенным fullscreen контролом провайдера. На узком mobile блок `Пред.` / `Серия 1 из 28` / `Следующая серия →` ломает геометрию, правый текст перекрывает стрелку и переносится на 2 строки. Дополнительно статусы источников выглядят вертикально невыравненными, кнопка «Все серии» и селектор озвучки не совпадают по высоте/радиусу с соседними контролами.

### Найденные причины в `main`

1. `components/AnimePlayer.tsx` безусловно рендерил `animebox-player-fullscreen-button` поверх `animebox-player-media`, даже для iframe Kodik с собственной кнопкой.
2. `app/patch14-5-episode-identity.css` содержал серию узкоэкранных хаков `font-size:0` + `::after {content:'След.'}` (18.7, 18.7b), а `components/EpisodePageDensity.module.css` позднее принудительно отменял псевдотекст через `span::after{content:none!important}` и менял геометрию; результат — длинная видимая подпись при фиксированных узких колонках.
3. Точки источников были inline flex children с тенями, без выделенного stable marker class; при разных font metrics выглядели смещёнными.
4. Меню перевода использовало Tailwind `rounded-2xl`, а nav — локальный `border-radius:10px`, при разных CSS-правилах высоты.

## Решение

### AnimePlayer

- Рендерить отдельную кнопку fullscreen только когда `!isKodik || fullscreenActive`. В обычном Kodik iframe нативная кнопка провайдера остаётся единственным способом перехода в полноэкранный режим внутри iframe. В уже активном AnimeBox fullscreen выход по-прежнему доступен, включая Telegram pseudo fullscreen. Native/HLS/Direct и другие внешние iframe остаются с существующим контролом AnimeBox.
- Не менять `usePlayerFullscreen`, key/identity iframe, postMessage, Kodik player flow, source selection, playback state, автопропуск и безопасность.
- Авто-скрытие exit overlay из 31.10.3 в fullscreen не удалять.

### EpisodeQuickSelector

- Имеются реальные desktop и mobile span-ярлыки: полная `nextLabel` на широких экранах, `След.` до 559px. Аналогично предыдущая серия — `Пред.`.
- `aria-label` на кнопках остаётся полным и понятным, мобильный дубль для screen reader помечен `aria-hidden=true`, основная команда доступна с клавиатуры.
- Центр показывает `Серия N` и `из N`, стрелка сохраняется и не перекрывается текстом.
- Сохраняются `disabled`, `onPrev/onNext`, открытие sheet, Escape и ссылки на полную подборку.

### CSS ownership

- Удалить только старые правила подмены текста через псевдоэлементы в `app/patch14-5-episode-identity.css`; не создавать новый глобальный файл и не размножать старые конфликты.
- В существующем `EpisodePageDensity.module.css` актуализировать route-scoped owner контроля: Grid с `minmax(0,...)`, реальными short/full labels, `white-space:nowrap`, точными 48px nav, 44px all episodes, 48px translation trigger, согласованными радиусами 8–10px.
- Оставить минимум 44px для физических touch targets, не вводить горизонтальный скролл всей страницы, предусмотреть 320–430px и safe-area.
- Источники: `Авто` без бессмысленного статуса загрузки; у реального провайдера статус сохраняется и вертикально центрируется фиксированной точкой 6px в inline-flex.

## Автоматические проверки

`scripts/mobile-player-shell-smoke.cjs` уже исполняется в AnimeBox Quality Gate через `mobile-player-shell:browser`. Уточнить fixture так, чтобы на мобильных он использовал полную исходную `nextLabel='Следующая серия'` (а не только заранее короткую тестовую подпись).

При ширинах 360,390,430,740,844,960,1100,1440,1920 px проверить:
- ровно один quick navigator и не более одного episode selector в обычном маршруте;
- разные кнопки `Пред.`, `Серия N`, `След.` в разных grid колонках без пересечений;
- ширина nav shell и отсутствие горизонтального overflow;
- `След.` реально показывается, полная подпись скрыта на телефоне, без переноса и текстового обрезания;
- минимум 44px для right/left и «Все серии»;
- фиксированная точка статуса источника выровнена по центру его text container;
- корень player `isolation:isolate` и проверенная политика dropdown над сериями, но под глобальным fixed topbar;
- исходный JSX имеет условие `(!isKodik || fullscreenActive)` для fullscreen icon.

Провести полный TypeScript, targeted ESLint, Next.js production build, existing fullscreen regression (включая hover/idle и iframe identity), profile editor/mobile/dark/light regression. Не ослаблять существующие browser assertions просто ради прохождения.

## Ручная приёмка перед закрытием

1. На настоящей странице Фрирен в Opera GX 1920×1080, Kodik iframe: нет второго оверлея fullscreen на обычном видео. Штатная иконка Kodik открывает полноэкранный режим.
2. В native/non-Kodik режиме кнопка AnimeBox остаётся и её hit target 44px.
3. При самостоятельном fullscreen AnimeBox кнопка выхода остаётся и на desktop уходит при idle, появляется при hover; Telegram touch не теряет способ выхода.
4. 320, 360, 390, 412, 430, 768, 1440, 1920 px: текст и стрелки не накладываются, все кнопки кликабельны, `Все серии` не гигантская.
5. Long title, 1 / 28, 28 / 28, 100 / 100, absent previous and disabled next; свето-тёмные темы и 200% zoom.
6. Убедиться, что навигация по эпизодам не вызывает неожиданный reload Kodik и no pointer obstruction на dropdown.

## Ограничения

- CSS хост-страницы не может управлять `iframe` cross-origin Kodik. Нативные кнопки и их дизайн остаются ответственностью провайдера.
- Если fullscreen внутри Kodik обрабатывается самим iframe браузером, `fullscreenActive` хоста может не отражать этот переход, но у пользователя останется нативный выход из полноэкранного просмотра (Escape). Хост не пытается перехватывать команды iframe.
- No DB migrations, secrets, Railway env, Supabase, CDN changes.
- Rollback: GitHub revert PR, Railway redeploy предыдущего SHA.
- Merge/deploy только после полного CI SUCCESS и явного release command.
