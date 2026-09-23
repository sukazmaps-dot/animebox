# AnimeBox RU Access Gateway v1

Purpose: keep AnimeBox deployed on Vercel while giving users in Russia a direct entry point that does not depend on Cloudflare proxy delivery.

## Architecture

```text
Browser
  -> youranimebox.com
  -> RU VPS / nginx
  -> cname.vercel-dns.com
     Host: youranimebox.com
     X-AnimeBox-Edge-Verify: <secret>
  -> Vercel / Next.js
```

Cloudflare may continue to host DNS, but the public `@` and `www` records must be **DNS only** when the gateway is enabled.

The application already supports `ANIMEBOX_EDGE_ORIGIN_SECRET` in `proxy.ts`. Do not commit the real secret. The bootstrap script generates it only on the VPS.

## VPS baseline

Recommended starting point:

- Ubuntu 22.04 or 24.04 LTS
- static IPv4
- 1 vCPU / 1 GB RAM is enough for the first users
- 10+ GB disk
- nginx ports 80/443 reachable
- SSH restricted to your admin access

The gateway is not an application server. Vercel still builds and runs Next.js.

## 1. Bootstrap the VPS

Clone the repository on the VPS and run:

```bash
sudo bash infra/ru-gateway/bootstrap-ubuntu.sh
```

This installs nginx, Certbot and the Cloudflare DNS Certbot plugin, writes nginx templates and generates a 64-character origin secret at:

```text
/root/.animebox-origin-secret
```

The production nginx site is intentionally **not enabled** yet.

## 2. Issue TLS before DNS cutover

DNS-01 is preferred because it lets you obtain the certificate before moving public traffic.

Create a scoped Cloudflare API token with only:

- Zone -> DNS -> Edit
- only the `youranimebox.com` zone

On the VPS:

```bash
sudo mkdir -p /root/.secrets/certbot
sudo nano /root/.secrets/certbot/cloudflare.ini
```

Contents:

```ini
dns_cloudflare_api_token = YOUR_SCOPED_CLOUDFLARE_TOKEN
```

Then:

```bash
sudo chmod 600 /root/.secrets/certbot/cloudflare.ini

sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/certbot/cloudflare.ini \
  -d youranimebox.com \
  -d www.youranimebox.com
```

Do not commit the Cloudflare token.

## 3. Enable nginx

After the certificate exists:

```bash
sudo ln -sfn /etc/nginx/sites-available/animebox /etc/nginx/sites-enabled/animebox
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Firewall example:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Only enable UFW after confirming the OpenSSH rule exists.

## 4. Test before changing DNS

Because the certificate already exists, you can force curl to the VPS IP without changing public DNS:

```bash
bash infra/ru-gateway/smoke-test.sh youranimebox.com VPS_IPV4
```

Expected:

```text
AnimeBox RU gateway smoke test passed.
```

The health endpoint is:

```text
https://youranimebox.com/__gateway-health
```

and successful gateway responses include:

```text
X-AnimeBox-Gateway: ru-v1
```

## 5. Cloudflare DNS cutover

Before changing anything, save the current DNS values so rollback is easy.

For the public site:

```text
A     @       VPS_IPV4     DNS only
A     www     VPS_IPV4     DNS only
```

If the VPS has no configured IPv6, remove old `AAAA` records for `@` and `www`. Otherwise some clients may continue to use the old route over IPv6.

Important: **do not enable the orange Cloudflare proxy** on these gateway records. Cloudflare can remain the authoritative DNS provider.

## 6. Lock Vercel behind the gateway

Do this only after nginx is working and public traffic is already reaching the VPS.

Reveal the gateway secret:

```bash
sudo cat /root/.animebox-origin-secret
```

Add the exact value in Vercel Production:

```text
ANIMEBOX_EDGE_ORIGIN_SECRET=<same value>
```

Redeploy production.

The nginx snippet already sends the same value as:

```text
X-AnimeBox-Edge-Verify
```

After the Vercel redeploy, requests that try to reach the canonical Vercel origin without the gateway header are rejected by AnimeBox.

## 7. What the gateway caches

Only:

```text
/_next/static/*
```

Dynamic HTML, API responses, profiles, sessions and Watch Together state are not cached by nginx.

The nginx upload ceiling is 20 MiB so the existing 16 MiB avatar/banner client limit is not reduced by the gateway.

## 8. Production smoke test

After DNS propagation:

```bash
bash infra/ru-gateway/smoke-test.sh
```

Also manually check:

- home page
- login / auth callback
- anime page
- episode player
- profile avatar/banner upload
- Telegram Mini App
- Watch Together room creation/join
- Premium checkout start

## Rollback

If the gateway has a problem:

1. remove or disable `ANIMEBOX_EDGE_ORIGIN_SECRET` in Vercel if the old path cannot supply the header;
2. restore the exact previous `@` / `www` DNS records saved before cutover;
3. wait for DNS propagation;
4. keep the VPS online until traffic has drained.

Do not use a Git rollback for an access-gateway outage. The Next.js deployment can stay unchanged; rollback is primarily DNS/origin-secret configuration.

## Notes

- Vercel remains the deployment platform.
- Git push -> Vercel deploy remains unchanged.
- Supabase is not moved.
- Cloudflare nameservers do not need to be changed.
- No real API tokens or gateway secrets belong in this repository.
