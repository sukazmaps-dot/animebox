# AnimeBox Milestone Frames v3 — Anime Homage Pass

Это новая линейка SVG, созданная с нуля по последним концептам.

## Принцип
- Рамка зарабатывается уровнем.
- Free — статичная версия.
- Premium — та же рамка, но оживает.
- Premium не выдаёт уровень и не ускоряет XP.

## Уровни
- LV.10 — Запретный реликт: цепи, перо, алый реликт, готика.
- LV.25 — Пламенная дуга: круговой огненный удар, искры, энергетический след.
- LV.50 — Багровая печать: запретный eye/sigil мотив, три лезвия, спектральная аура.
- LV.75 — Угроза: оригинальные manga-pressure glyphs, фиолетово-розовый pressure effect.
- LV.100 — Абсолютный престиж: расколотая маска-реликт, bone armor, blue-violet fissures, crossed blades.

## Папки
- free/ — 5 SVG без анимаций.
- premium/ — 5 SVG с CSS-анимациями.

## Технически
- чистый SVG, без PNG внутри;
- viewBox 0 0 512 512;
- прозрачный центр;
- free-файлы не содержат keyframes;
- premium-файлы содержат keyframes и prefers-reduced-motion.

## v3.1 — Animation-safe
Исправлена главная причина скачков Premium-анимаций:
- LV.75: базовые `translate/rotate/scale` glyphs остаются на внешнем `<g>`, а движение идёт во вложенном `.glyphMotion`;
- LV.10: позиция пера остаётся на внешнем `<g>`, покачивание идёт во вложенном `.featherMotion`;
- LV.50: добавлен `transform-box:view-box` для стабильного вращения вокруг центра SVG;
- LV.25 и LV.100 проверены — конфликтов base transform / CSS transform нет.
