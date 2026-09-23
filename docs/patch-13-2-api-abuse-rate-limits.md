# Patch 13.2 — API Abuse Guard v1

## Goal

Protect AnimeBox from request floods, bot loops, repeated state mutations and expensive upstream API abuse without adding friction for normal users.

## Architecture

- Shared atomic counters live in `api_rate_buckets` and are consumed through `consume_api_rate_bucket`.
- Keys are HMAC-SHA256 hashes, so raw IP addresses and user IDs are never stored in the limiter table.
- Anonymous/public surfaces use Vercel's canonical `x-forwarded-for` client address.
- Authenticated mutations use both IP and user buckets.
- The limiter fails closed: if the shared counter is unavailable, protected endpoints return HTTP 503 instead of silently bypassing protection.
- HTTP 429 responses include `Retry-After` and `Cache-Control: private, no-store`.
- Existing database anti-spam rules remain enabled as a second layer.
- Buckets older than two hours are cleaned by the existing Premium Lifecycle cron.

## Protected surfaces

| Surface | Policy |
| --- | --- |
| Anime catalog | 90/min/IP |
| Episode comments | read 120/min/IP; write 30/min/IP + 10/min/user |
| Profile editor | read 60/min/user; write 30/min/IP + 12/min/user |
| Profile media signed uploads | write 40/min/IP + 24/min/user |
| Profile media cleanup | 60/min/IP + 40/min/user |
| Smart recommendations | 120/min/IP |
| Taste Graph | 30/min/IP + 12/min/user |
| Community chat | read 180/min/IP; write 90/min/IP + 45/min/user |
| Chat delete | 60/min/IP + 30/min/user |
| Chat reactions | 240/min/IP + 120/min/user |
| Chat reports | 30/hour/IP + 10/hour/user |
| Watch Together room list/create | existing guard retained |
| Watch Together heartbeat | 600/min/IP |
| Watch Together reports | 20/hour/IP |
| Product analytics intake | 180 requests/min/IP plus existing payload/event caps |
| Telegram web auth nonce | 30/min/IP |
| Telegram web auth login | 20/min/IP |
| Telegram Mini App nonce | 30/min/IP |
| Telegram initData validation | 60/min/IP |
| Telegram registration | 12/min/IP |
| Telegram session | 30/min/IP |
| Telegram account linking | 20/min/IP |
| Telegram subscription check | 60/min/IP |
| Image proxy | 600/min/IP |
| Kodik lookup | 180/min/IP |
| AniLibria source lookup | 120/min/IP |
| Alloha lookup | 120/min/IP |

## Acceptance criteria

1. Normal browsing, profile editing, uploads, chat, recommendations, Telegram login and Watch Together remain usable.
2. Repeated abusive calls return HTTP 429 with a useful `Retry-After` header.
3. A limiter infrastructure failure returns HTTP 503 on guarded endpoints.
4. Raw IP addresses are not persisted.
5. Existing application- and database-level anti-spam remains active as defense in depth.
6. Upstream-heavy endpoints are protected before they make provider requests.
7. Old limiter buckets are removed automatically.
