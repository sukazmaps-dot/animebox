# Hotfix 31.10.4 — Kodik opening reset / provider ownership

**Пользовательский сигнал:** Reddit: после нажатия встроенного «Пропустить опенинг» плеер иногда начинает серию с 0; иногда то же происходит при естественном окончании опенинга. Фактический origin отката времени ещё не измерен, поэтому это защита подтверждённых механизмов потенциального сброса, а не доказательство конкретной проблемы на стороне Kodik.

**База:** production merge `6b76ff9949a5e8e82d376091c524a5acd2735164`. **Ветка:** `fix/hotfix-31-10-4-kodik-opening-ownership`.

## Причина / анализ

В AnimeBox существуют три отдельных пути управления временем Kodik:

1. Встроенная кнопка пропуска в iframe Kodik (её управление принадлежит Kodik). Компонент `KodikPlayer` пересылает событие `kodik_player_skip_opening` только в `watchSession.onProviderSkip` для учёта просмотра.
2. `AnimePlayer.requestOpeningSkip('auto')` по локальной timeline-метаинформации при входе в OP отправлял `postMessage(kodik_player_api, {method:'seek',seconds:end})`. Это может конфликтовать с собственной кнопкой и таймкодами Kodik, а metadata из AnimeBox не гарантированно совпадает с выбранным дубляжом/версией монтажа.
3. `KodikPlayer.forceRouteEpisode()` отправлял `change_episode` на событие `kodik_player_current_episode`, не проверяя, что видео уже идёт. Задержавшийся/ошибочный номер серии во время воспроизведения мог перезапустить iframe с начала. Этот механизм является вторым возможным объяснением сброса, хотя конкретный реальный provider event ещё не собран.

## Изменения

- В `AnimePlayer.tsx` явно запретить `requestOpeningSkip('auto')` для `isKodik`; перед автоматическим вызовом из `handleTimeSample` добавить `!isKodik`. Это **не отключает авто-пропуск** для native HLS/video.
- Встроенную кнопку Kodik и `onProviderSkip` (watch-telemetry) **сохранить**; не заменять кнопку собственным меню, не менять DOM, `iframe` key, translation, источник или skip policy серверных данных.
- В `KodikPlayer.tsx` разрешить `forceRouteEpisode` только до реального прогресса (позиция ≤5 сек). После этого не выполнять неожиданную `change_episode`, потому что исправление ошибочного metadata недопустимо ценой перезапуска уже воспроизводимой серии.
- Сохранить начальную коррекцию неверного номера серии перед просмотром и её однократность. При намеренном переключении серии AnimeBox создаёт новый route/iframe с правильным `episode`.

## Регрессия

`tests/kodik-opening-ownership.cjs` — реальный `KodikPlayer` через React test renderer с подставленным `iframe.contentWindow.postMessage`:

1. `time_update(position=90s,duration=1440s)`, затем `skip_opening` — событие учёта отправлено ровно один раз, но **нет host seek**.
2. `current_episode` другого номера при позиции 90 сек — **нет change_episode**.
3. Несовпадающая серия до первого time sample — **одна** `change_episode` правильного маршрута, повторение не создаёт вторую.
4. Проверки source contract: у автоматического path два независимых запрета на Kodik; собственная кнопка спрятана для Kodik; native пропуск и телеметрия остаются.
5. Test включён в `npm run opening-skip-safety:check` в составе общего production `prebuild`.
6. Общий Quality Gate Next.js/TS/lint/tests/build должен стать 100% SUCCESS на точном head SHA.

## Приёмка в браузере

На Фрирен и ещё двух тайтлах с OP:

- Kodik: вручную нажать его native «Пропустить опенинг», проверить, что воспроизведение остаётся **после OP**, а не 0.
- Kodik: дать OP пройти естественно, убедиться, что нет автокоманд `seek` / `change_episode` из AnimeBox после старта.
- Сменить озвучку/серию: правильный episodeNumber, источник, сохранение прогресса и нормальное поведение при старте.
- HLS/Direct: автоматический OP пропуск продолжает работать и не прыгает за весь эпизод.
- Watch Together, mobile, fullscreen, Telegram Mini App и Resume проверить на отсутствие новых перезапусков iframe.
- DevTools (при воспроизведении): собрать точный источник `postMessage`, provider events, таймкоды до/после. Отдельный отчёт, если **внутренний** Kodik сам отправляет позицию 0 после native skip, потому что AnimeBox не может изменить поведение кросс-доменного iframe.

## Ограничения

Без новых миграций, env, API, Supabase, CSS или зависимости. Не объединять с PR #255/#256 до завершения отдельных тестов. Не обещать устранения внутренней ошибки Kodik без реальной приёмки с воспроизводимым provider URL.
