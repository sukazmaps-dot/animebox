# AnimeBox

Аниме-каталог с персональными списками, рекомендациями и совместным просмотром. Проект развивается как самостоятельный веб-сервис.

**[Открыть AnimeBox](https://youranimebox.com)** · [Код на GitHub](https://github.com/sukazmaps-dot/animebox)

## Что есть в проекте

- Каталог аниме: поиск, фильтры, страницы тайтлов и расписание выхода серий.
- Личные профили, библиотека, оценки и сохранение прогресса просмотра.
- Рекомендации с учётом предпочтений пользователя.
- Просмотр через интегрированный внешний плеер и комнаты совместного просмотра.
- Комментарии, достижения и социальные функции.
- Telegram-бот и Mini App.

## Технологии

| Часть | Стек |
| --- | --- |
| Интерфейс | Next.js (App Router), React, TypeScript, CSS Modules |
| Данные и авторизация | Supabase, PostgreSQL |
| Серверная логика | Next.js Route Handlers, внешние API |
| Инфраструктура | Cloudflare Workers / R2, Railway |
| Интеграции | AniList, Shikimori, Telegram |

## Структура репозитория

| Каталог | Назначение |
| --- | --- |
| `app/` | Маршруты, страницы и API Next.js |
| `components/` | Компоненты интерфейса |
| `lib/`, `hooks/`, `types/` | Логика приложения, хуки и типы |
| `supabase/`, `database/` | SQL и миграции базы данных |
| `infra/` | Конфигурации и сервисы инфраструктуры |
| `scripts/`, `tests/` | Проверки, автоматизация и регрессионные тесты |
| `docs/` | Техническая документация и история изменений |

## Локальный запуск

Нужен **Node.js 22** и npm.

```bash
git clone https://github.com/sukazmaps-dot/animebox.git
cd animebox
npm ci
npm run dev
```

Сайт будет доступен на [localhost:3000](http://localhost:3000).

Для авторизации, каталога и серверных интеграций потребуется настроить собственное окружение и подключить соответствующие сервисы. Ключи и production-настройки в репозитории не публикуются. Без них отдельные возможности могут не работать.

Основные команды:

```bash
npm run lint
npm run prebuild
npm run build
```

`npm run build` запускает предварительные проверки проекта. Для PR также используется GitHub Actions Quality Gate.

## Документация

- [Навигация по документации](docs/README.md)
- [Дизайн-система](docs/design-system.md)
- [Инфраструктура Watch Together](infra/watch-party/README.md)
- [Конфигурация RU Gateway](infra/ru-gateway/README.md)

---

Разработчик: **kazumeq* · [Telegram](https://t.me/kazuminyan)
