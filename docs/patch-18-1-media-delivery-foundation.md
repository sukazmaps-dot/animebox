# Patch 18.1 — AnimeBox Media Delivery Foundation

## Цель

Убрать массовые сломанные постеры при длинных recommendation rails и вынести
доставку публичных anime images из Vercel API в отдельный media layer.

## Архитектура

Browser -> media.youranimebox.com -> Cloudflare Worker -> Edge Cache -> R2
(on miss) -> AniList/Shikimori.

R2 binding называется `MEDIA_BUCKET`. Worker умеет запускаться без R2 и тогда
использует Cloudflare Cache API; после подключения R2 persistent origin cache
включается автоматически без изменения клиентского протокола.

## Client fallback

Для каждого remote poster AnimeBox строит короткую host-level цепочку:

1. `NEXT_PUBLIC_MEDIA_ORIGIN` (включается только после готовности media edge)
2. `NEXT_PUBLIC_MEDIA_RU_ORIGIN` (если задан)
3. original remote URL
4. один same-origin legacy proxy fallback
5. local AnimeBox placeholder

Одинаковые размеры одного и того же CDN больше не должны создавать длинный
каскад повторных запросов до прокси.

## Россия

Код поддерживает независимый `NEXT_PUBLIC_MEDIA_RU_ORIGIN`.
Он должен указывать на origin/CDN, который не проходит через Cloudflare.
Пока этот URL не задан, вторым контуром остаётся direct origin.
Готовый независимый disk-cache origin лежит в `infra/media-ru/`.

## Безопасность Worker

Worker:
- принимает только HTTPS;
- разрешает только AniList/Shikimori/MyAnimeList/Jikan media hosts;
- проверяет Content-Type;
- ограничивает объект 10 MiB;
- имеет origin timeout 8 секунд;
- не кэширует upstream errors как успешные изображения;
- использует SHA-256 source URL как storage key.

## R2 blocker

На момент подготовки патча Cloudflare API возвращал error 10042:
`Please enable R2 through the Cloudflare Dashboard.`

Поэтому R2 bucket нельзя создать программно до одноразового включения R2
в dashboard аккаунта. Worker остаётся совместимым с Cache API до подключения
bucket.

## Следующий инфраструктурный шаг

После включения R2:
- создать bucket `animebox-media`;
- добавить Worker binding `MEDIA_BUCKET`;
- задеплоить `infra/cloudflare/media-worker.js`;
- привязать `media.youranimebox.com`;
- проверить `/health` и первый MISS -> HIT.


## Poster geometry

Smart Feed больше не позволяет натуральному размеру remote image участвовать
в layout. Poster slot владеет геометрией: фиксированное соотношение 2:3,
внутренний image wrapper абсолютно заполняет slot, а img всегда рендерится
через object-fit: cover. Для горизонтальных карточек отключено
content-visibility reservation, которое могло временно применять устаревший
intrinsic size к далеко расположенным flex children.

## Cloudflare connector blocker

Подключённый Cloudflare connector видит нужную zone и Workers, но попытка
загрузить новый Worker через API сейчас возвращает:
`No access to the specified resource.`

То есть у подключения есть read-access, но нет Worker write permission.
До расширения прав патч не включает `NEXT_PUBLIC_MEDIA_ORIGIN`, поэтому
production не получает лишний 2.5s miss на несуществующий media hostname.

После выдачи Worker write permissions и включения R2:
- создать R2 bucket;
- deploy Worker;
- bind MEDIA_BUCKET;
- attach media.youranimebox.com;
- проверить health/MISS/HIT;
- только затем включить NEXT_PUBLIC_MEDIA_ORIGIN в Vercel.
