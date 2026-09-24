# AnimeBox RU Media Origin

Independent poster fallback for users whose ISP has trouble reaching Cloudflare.

## Deploy

1. Provision a small VPS that is reliably reachable from Russian ISPs.
2. Copy this directory to the VPS.
3. Run `docker compose up -d --build`.
4. Configure Nginx from `nginx.conf.example` and TLS.
5. Create `media-ru.youranimebox.com` as a DNS-only A/AAAA record pointing to the VPS.
6. Set Vercel environment variable:
   `NEXT_PUBLIC_MEDIA_RU_ORIGIN=https://media-ru.youranimebox.com`.

The service only proxies approved anime-image hosts and writes successful
images to a persistent local Docker volume. Failed upstream requests are not
stored as valid posters.

`GET /health` returns a small JSON health response.
