# Patch 13.4 — UGC & Media Safety v1

## Goal

Treat user-generated content as untrusted until the AnimeBox server has validated it.

This patch hardens the two current high-value UGC surfaces:

- profile avatar/banner uploads;
- episode comments.

## Profile media pipeline

The public bucket is never the first upload target.

```text
browser
  -> signed upload
  -> private profile-media-quarantine
  -> server byte inspection
  -> policy validation
  -> public profile-media
```

The server no longer trusts the browser-provided MIME or file extension as proof of image type.

### Byte-derived image inspection

`lib/profile-media-inspect-server.ts` parses supported formats directly from bytes:

- JPEG SOF dimensions;
- PNG IHDR dimensions and acTL animation marker;
- WebP VP8 / VP8L / VP8X dimensions and ANIM chunk;
- GIF logical-screen dimensions.

SVG and arbitrary HTML/binary files are not part of the accepted image set.

### Server-side checks before publication

Before a quarantine object can enter the public bucket, AnimeBox validates:

1. the quarantine path belongs to the authenticated user;
2. scope/kind/variant match the expected path;
3. one private object is not reused twice in the same publication;
4. actual file size is within AnimeBox limits;
5. real byte-derived MIME is allowed for the selected mode;
6. Storage MIME, when present and recognized, matches the actual bytes;
7. public filename extension matches the actual image format;
8. dimensions and total pixels are within the UI's supported geometry;
9. animated media is accepted only as original Premium media.

### Geometry limits

- avatar original/base: max 1024×1024;
- banner original/base: max 2400×1200;
- Premium static avatar fallback: max 512×512;
- Premium static banner fallback: max 1500×900.

These mirror or exceed the current client output limits, so normal uploads continue working while direct API bypasses cannot publish decompression-heavy dimensions.

### Animation policy

- Base avatar/banner: static only.
- Premium original avatar/banner: animation allowed.
- Premium static fallback: static WebP only.

This preserves animated Premium profiles while guaranteeing a safe static fallback.

## Storage verification

Production Supabase was checked during the patch:

- `profile-media` is public;
- `profile-media-quarantine` is private;
- both buckets currently have an 8 MiB storage-level file cap;
- both allow only JPEG, PNG, WebP and GIF MIME types.

AnimeBox application limits remain stricter where appropriate (2 MiB Premium avatar, 6 MiB Premium banner, 5 MiB base media).

## Comments

The episode comments API now uses the shared `readBody()` parser instead of raw `request.json()`.

That adds:

- same-origin validation;
- a 20,000-character JSON body ceiling;
- consistent malformed-JSON errors.

Comment text remains plain text. Control characters are stripped, line endings normalized and excessive blank-line runs collapsed. The spoiler flag is accepted only when the JSON value is the boolean `true`; strings such as `"false"` are no longer treated as truthy.

## Build-time invariant

`scripts/ugc-media-safety-check.mjs` is part of `npm run security:check`.

The build fails if the byte inspector, ownership check, geometry guard, MIME/extension checks, animation policy, signed-upload static WebP gate or bounded comments parser are accidentally removed.

## Acceptance criteria

- A fake JPEG containing non-image bytes is rejected.
- A PNG uploaded under a JPG path is rejected.
- A valid image with dimensions above policy is rejected before publication.
- Animated WebP/PNG cannot be published as base/static media.
- Premium original GIF/animated WebP remains supported.
- Public media is published with the MIME detected from its bytes.
- Existing normal profile uploads continue to work.
- Comments remain plain text and cannot submit unbounded JSON payloads.
