#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash infra/ru-gateway/bootstrap-ubuntu.sh"
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SECRET_FILE="/root/.animebox-origin-secret"

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  nginx \
  certbot \
  python3-certbot-dns-cloudflare \
  curl \
  ca-certificates \
  openssl

install -d -m 0755 /var/www/certbot
install -d -m 0755 /var/cache/nginx/animebox
install -d -m 0755 /etc/nginx/snippets

install -m 0644 \
  "${SCRIPT_DIR}/00-animebox-gateway-http.conf.example" \
  /etc/nginx/conf.d/00-animebox-gateway-http.conf

install -m 0644 \
  "${SCRIPT_DIR}/proxy-common.conf.example" \
  /etc/nginx/snippets/animebox-proxy-common.conf

install -m 0644 \
  "${SCRIPT_DIR}/animebox.conf.example" \
  /etc/nginx/sites-available/animebox

if [[ ! -s "${SECRET_FILE}" ]]; then
  openssl rand -hex 32 > "${SECRET_FILE}"
  chmod 600 "${SECRET_FILE}"
fi

ORIGIN_SECRET="$(tr -d '\r\n' < "${SECRET_FILE}")"

sed "s|__ANIMEBOX_ORIGIN_SECRET__|${ORIGIN_SECRET}|g" \
  "${SCRIPT_DIR}/animebox-origin-secret.conf.example" \
  > /etc/nginx/snippets/animebox-origin-secret.conf

chmod 600 /etc/nginx/snippets/animebox-origin-secret.conf

echo
echo "AnimeBox RU gateway packages and templates are installed."
echo
echo "The site is NOT enabled yet because TLS certificates must exist first."
echo "Origin secret is stored locally at:"
echo "  ${SECRET_FILE}"
echo
echo "Next:"
echo "  1) Issue a Let's Encrypt certificate (DNS-01 is recommended)."
echo "  2) Put the same secret into Vercel Production as ANIMEBOX_EDGE_ORIGIN_SECRET."
echo "  3) Enable /etc/nginx/sites-available/animebox and run nginx -t."
echo "  4) Point youranimebox.com + www to this VPS with Cloudflare DNS-only."
echo
echo "Reveal the secret only when you need to paste it into Vercel:"
echo "  sudo cat ${SECRET_FILE}"
