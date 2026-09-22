# AnimeBox Patch 12.3.3 — Mood Density + Final Home Polish

## Goal
Make the Mood Picker behave visually like a quick recommendation filter instead of a full content section.

## Changes
- Desktop Mood Picker is compacted to an auto-height row.
- Desktop chips are fixed at 48 px.
- Mobile chips are 50 px, 48 px on very small phones.
- Decorative icon footprint is reduced without changing the WebP assets.
- Intro spacing and typography are tightened.
- Mood descriptions are shortened so they remain readable in one line.

New hints:
- Мой вкус — По истории
- Уют — Спокойно и тепло
- Триллер — Тайны и риск
- Драма — Сильные эмоции
- Другие миры — Миры и приключения

Intro:
- Какое настроение на вечер?
- Выбери настроение — подстроим подборку.

## Scope limits
No change to:
- recommendation scoring;
- stored TasteMood values;
- analytics;
- player / progress;
- Premium / streak;
- Telegram Mini App logic;
- database schema.

## QA
Check desktop, 768 px, 430, 390 and 360 px.
Verify every mood label and hint is readable, the active state does not change chip height, and the section no longer dominates the Home viewport.
