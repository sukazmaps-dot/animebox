# Patch 30.9 — Аватары, баннеры и мобильное кадрирование

Дата: 16.10.2026. Проект: AnimeBox, Next.js App Router / React / TypeScript.
Ветка: patch-30-9-profile-media. Изменяется существующая реализация.

## 1. Диагностика конкретного сбоя

Пользователь уточнил: обычный JPG/PNG, ошибка сразу после выбора, до кропа.
Сообщение со скриншота находится в stabilizePickedFile: оно возникает при
чтении picker-backed File. До Supabase Storage этот файл ещё не дошёл.
Это устанавливает стадию сбоя; внутренний код ошибки конкретного телефона
без его Console неизвестен. Частота «90%» сообщена пользователем, а не
подтверждена серверной статистикой.

Проверено в настоящем Supabase проекта:

- profile-media: public, потолок 8 MiB; JPEG/PNG/WebP/GIF.
- profile-media-quarantine: private, те же MIME и потолок 8 MiB.
- INSERT/UPDATE для браузера не разрешены; публичный SELECT и удаление
  собственного файла уже ограничены bucket и первой папкой auth.uid().
- Новый файл загружается по подписанному URL в приватный карантин.
  Сервер проверяет байты, MIME, размеры, анимацию и владельца, затем публикует.
- Поэтому совет «добавить всем authenticated INSERT» здесь был бы ошибкой:
  он обошёл бы существующую серверную проверку.

| Возможная причина | Как отличить и проверить |
|---|---|
| Android content provider / потерянный доступ к File | Ошибка сразу после выбора; Console [ProfileMedia], stage read. Проверить NotReadableError и FileReader-фоллбэк. Не сбрасывать input до окончания чтения. |
| Пустой, повреждённый файл | Нулевой byte stream либо оба декодера отказали; новый файл из другого приложения помогает проверить источник. |
| HEIC/HEIF | Браузер не поддерживает native decode; проверить загрузку динамического heic2any и ошибки конвертации. |
| Слишком большое разрешение / память | Ошибка decode или защитного лимита; проверить размер, разрешение и слабое устройство отдельно от Storage. |
| MIME/расширение | Android может вернуть пустой MIME или octet-stream. Формат определяется по сигнатуре, Blob получает канонический MIME. |
| Лимит бакета/проекта/request | Upload реально присутствует в Network, Storage отвечает 413/EntityTooLarge. Проверить оба уровня лимита и размер уже сжатого body. |
| RLS/сессия/чужой путь | 401/403 в upload-url или Storage. Проверить auth.uid(), истечение сессии, подписанный путь и права пользователя. |
| Перезапись без нужных прав | При прямом SDK upsert нужны INSERT, SELECT и UPDATE. Этот проект вместо прямого upsert использует серверную публикацию. |
| Слабый интернет/таймаут | Prepare/sign и actual upload — разные запросы и разные таймеры. Ошибка после ожидания, а не при выборе файла. |
| Premium закончился | upload-url и окончательное сохранение заново читают действующие entitlements; UI не является проверкой прав. |

### Где увидеть точную ошибку

1. DevTools → Console → фильтр [ProfileMedia]. Для Android можно использовать
   удалённую отладку Chrome. Ошибка чтения не появится в логах Storage.
2. Network: /api/profile/media/upload-url → signed Storage upload →
   /api/profile/editor. Посмотреть HTTP status и JSON response на каждой стадии.
3. Supabase Dashboard → Logs → Storage: найти запрос по времени, статусу
   и request ID. Не публиковать подписанные URL, токены и содержимое файлов.
4. Новый обработчик uploaded.error сохраняет stage, code, MIME, bytes,
   kind и scope. Пользователь получает понятное сообщение вместо raw object.
5. Для signing/publish ошибок проверить также runtime-логи Next.js/Railway.

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('profile-media', 'profile-media-quarantine');

select policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'storage' and tablename = 'objects';

select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('avatar_url','banner_url','avatar_path','banner_path',
                      'banner_color','banner_color_mode');
```

## 2. Реализованная цепочка обработки

1. До асинхронной обработки сохраняются байты выбранного File.
2. При отказе Blob.arrayBuffer или пустом результате используется FileReader,
   с ограничением времени чтения. Input очищается только после обработки.
3. Для HEIC сначала пробуется native decode; иначе динамический heic2any.
4. Изображение перерисовывается без исходных метаданных, максимум 2048px
   по длинной стороне для редактора вместо прежних 4096px.
5. Статичный кроп использует один calculateProfileMediaCropRect и в preview,
   и при экспорте. Доступны перетаскивание, стрелки и масштаб 1–3.
6. Финальный WebP кодируется с понижением quality до попадания в бюджет.
   Если WebP encoding недоступен, используется JPEG с явным фоном прозрачности.
7. Сжатый файл загружается в карантин, а не исходное фото на 10+ MiB.

| Вид | Максимальный итоговый размер | Бюджет статичного файла |
|---|---|---|
| Обычный аватар | 256×256 | 200 KiB |
| Premium-аватар | 512×512 | 200 KiB |
| Баннер-картинка, только Premium | 960×320 | 300 KiB |

Маленькие источники не увеличиваются искусственно. Защита исходника:
32 MiB, до 80 млн декодированных пикселей и до 20 000px на сторону.
Это конечные защитные пределы, а не обещание обработать любое изображение
на любом телефоне. Тест 12,8 MB выполняется на реальном browser canvas.

Premium GIF/Animated WebP сохраняют анимацию, имеют отдельные прежние
лимиты 8 MiB для аватара и 6 MiB для баннера. Бюджет 200/300 KiB относится
к статике: ужимать произвольную анимацию до него без изменения кадров
этот патч не обещает. Для анимации создаётся статичный fallback.
Для статичного Premium-медиа отдельная дублирующая копия не создаётся.

## 3. Готовые функции и использование

- lib/profile-media-normalize-client.ts: normalizePickedImage,
  stabilizePickedFile, isAnimatedPickedImage.
- lib/profile-media-crop-client.ts: compressImage (= prepareBaseProfileMedia),
  extractDominantColor, calculateProfileMediaCropRect.
- lib/profile-media-upload-client.ts: uploadAvatar, uploadBanner,
  setBannerColor, profileMediaFetchWithTimeout.

```ts
const source = await normalizePickedImage(file);
const cropped = await compressImage(
  source, 'avatar', {x: 50, y: 50, zoom: 1}, premiumActive,
);
const color = await extractDominantColor(cropped);
const pending = await uploadAvatar({
  scope: 'base', variant: 'original', body: cropped,
});
// pending.publicPath + pending.quarantinePath передать в существующий
// POST /api/profile/editor вместе с profile и pendingMedia.
// uploadAvatar не обходит финальную проверку и сам не меняет profiles.

const banner = await compressImage(source, 'banner', cropTransform, true);
const pendingBanner = await uploadBanner({
  scope: 'base', variant: 'original', body: banner,
}); // сервер отклонит вызов без Premium независимо от переданного true.

await setBannerColor('#7a538c', 'manual'); // только собственная строка через RLS.
// Для автоподбора сначала extractDominantColor(cropped), затем mode 'auto'.
```

Интегрированный редактор сохраняет цвет вместе с остальным черновиком
через существующий POST. Отдельный setBannerColor пригоден для самостоятельной
палитры: проверяет сессию, формат цвета и обновляет только строку текущего user.

## 4. Баннер и Premium

Обычный пользователь видит цвет баннера, выбор «Авто — по аватарке» /
«Выбрать вручную» и color picker. Баннер-картинка не загружается без Premium.
В автоматическом режиме при замене аватара вычисляется доминантный цвет.
Ручной цвет не перезаписывается. Для Advanced Premium Studio изменение
цвета выполняется только при сохранённом режиме auto.

Premium-пользователь дополнительно получает загрузку картинки с кропом.
После истечения Premium изображение баннера скрывается во всех общих
resolver-сценариях: собственный профиль, публичный профиль и мини-профиль.
Изображение не удаляется автоматически — его можно вернуть после продления.
Статичный fallback аватара при истечении Premium сохраняется.

Миграция добавляет banner_color и banner_color_mode, CHECK для hex и режима.
avatar_url/banner_url уже существуют, avatar_path/banner_path являются
каноническими ссылками действующей системы. Вторую конкурирующую схему
профиля не создаём. is_premium возвращается API редактора и вычисляется по активным entitlements с
starts_at/expires_at, а не хранится как редактируемый пользователем boolean.

Миграция: supabase/migrations/20261016085920_profile_media_banner_color_v1.sql.
Применена к существующему Supabase. Проверены новые колонки/constraints
и тест под ролью authenticated в транзакции с rollback: чужой профиль
не читается/не обновляется, прямой INSERT в карантин запрещён.
Security advisors до/после: состав и количество прежних замечаний не изменились.

## 5. Storage, RLS и отсутствие накопления

В проекте avatars и banners — виды внутри profile-media, а не отдельные
физические бакеты. Общий публичный бакет и приватный карантин сохраняются,
иначе существующие URL, профили и серверная проверка потребовали бы миграции.

Воспроизводимый SQL существующих политик: docs/sql/PROFILE-MEDIA-RLS-REFERENCE.sql.
Он дан как справочный эквивалент, отдельного изменения прав в production нет.

Действующие политики:

```sql
-- Представление фактических политик, не повторная миграция:
-- SELECT: bucket_id = 'profile-media' (изображения профиля публичные).
-- DELETE TO authenticated:
-- bucket_id = 'profile-media'
-- AND (storage.foldername(name))[1] = (select auth.uid())::text.
-- INSERT/UPDATE TO authenticated: разрешающих политик нет.
-- Карантин приватный; сервер выдаёт signed upload только в user_id/pending/...
```

Права на баннер проверяются при выдаче URL и финальной записи. Путь и
байты перепроверяются сервером, включая анимацию внутри WebP: MIME/RLS
сами по себе не умеют надёжно определить число кадров файла.

**Осознанное отличие от user_id/avatar.webp:** публичные пути остаются
версионными user_id/avatar-UUID.webp. Это сохраняет работающий rollback,
не затирает текущий аватар до успешной записи profiles и избегает stale CDN
при overwrite. После успешной записи заменённые старые файлы удаляет сервер,
а для обычного статичного Premium-изображения используется один объект.
Сравнение старых avatar/banner при UPDATE защищает от части гонок двух вкладок.

Cache-Control: 31536000 на неизменяемом публичном URL; карантин cacheControl 0.
Новый UUID в URL сам выполняет cache-busting, поэтому ?v=timestamp не нужен.
Если переходить на фиксированный путь отдельно, потребуются upsert,
INSERT+SELECT+UPDATE RLS, версия в URL и безопасная стратегия отката overwrite.

При сбое очистки успешное сохранение не объявляется неуспешным: пишется
cleanup deferred. Массовое удаление прежних объектов этим патчем не запускается.
Приватные orphan-файлы после прерывания/таймаута могут требовать отдельной
регулярной очистки через Storage API после периода ожидания; SQL DELETE
из storage.objects не используется как замена физическому удалению файлов.

Чтобы снижать egress: хранить только сжатые размеры, кэшировать стабильные
версии через CDN, использовать статичный fallback анимации на маленьких
социальных поверхностях, не создавать трансформации под каждый произвольный
размер и не перезагружать файл с новым ?v при каждом рендере.

## 6. Исправление второго скриншота

Оба редактора кропа используют общий ProfileMediaModal: native dialog.showModal
в document.body. Native top layer находится над fixed-навигацией и savebar
независимо от CSS z-index и transform/contain родителей.

Убраны устаревшие конфликтующие background-image заглушки из community/identity CSS.
Цвет обычного и Premium fallback-баннера задаётся единственным владельцем
в patch16-5-profile-widgets.css через --profile-banner-color; проверяется
по computed styles, включая светлую тему и Premium-класс.

Диалог учитывает visualViewport, safe-area, ограничение высоты и внутренний
scroll. Действия sticky снизу, цели нажатия не менее 44px. Escape, фокус,
запрет фоновой прокрутки и его снятие имеют одного владельца. Старые
дублирующие обработчики lock/Escape удалены, чтобы не оставлять body locked.

## 7. Тестирование и границы проверки

Автотесты: npm run patch30-9:check; npm run profile-media:browser.

- Настоящий JPEG 12 825 148 байт, 4096×3072, MIME octet-stream.
- Искусственно отклонён arrayBuffer с NotReadableError; FileReader читает файл.
- Результаты: regular 256×256, premium 512×512, banner 960×320, все в бюджете.
- WebP encode недоступен: реальный JPEG fallback.
- Доминантный цвет #cc4422 на контрольном PNG; повреждённый файл отвергается.
- Настоящий HEIC 128×96: конвертация в WebP динамическим декодером.
- Реальные API-функции: free avatar / free banner forbidden / Premium banner /
  expired Premium / oversized file / server animation and geometry checks.
- Таймаут prepare request с AbortController, таймаут SDK upload, Storage 413.
- 8 browser-сценариев: dark/light × 360/390/412px + landscape; кнопки
  доступны поверх навигации с максимальным z-index; Escape/focus/scroll.
- Storage RLS проверены в настоящей БД без сохранения тестовых данных.

Дополнительная ручная приёмка перед массовым объявлением об исправлении:

- [ ] Выбор JPG/PNG из того же приложения телефона, где был исходный сбой.
- [ ] Фото iPhone с EXIF rotation и HEIC нескольких моделей устройств.
- [ ] Медленная мобильная сеть, обрыв связи, повторное сохранение.
- [ ] Premium GIF/Animated WebP, маленький static fallback и истёкшие права.
- [ ] Ручной цвет не меняется после аватара; auto меняется после нового кадра.
- [ ] Повторная замена: старый файл удалён, не затронуты текущие media references.
- [ ] Две вкладки: stale media update получает 409 вместо восстановления старого пути.

Ни один реальный пользовательский аватар не изменялся тестами. Проверка
клиентского pipeline и API использует синтетические файлы/моки авторизации;
полный вход и реальная загрузка за пользователя в браузере не имитировались.
