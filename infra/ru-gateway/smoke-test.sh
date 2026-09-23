#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-youranimebox.com}"
IP="${2:-}"

curl_args=(
  --fail
  --silent
  --show-error
  --max-time 15
)

if [[ -n "${IP}" ]]; then
  curl_args+=(--resolve "${DOMAIN}:443:${IP}")
fi

echo "[1/4] nginx config"
if command -v nginx >/dev/null 2>&1; then
  nginx -t
else
  echo "nginx not installed locally; skipping"
fi

echo "[2/4] gateway health"
health="$(curl "${curl_args[@]}" "https://${DOMAIN}/__gateway-health")"
[[ "${health}" == *"animebox-ru-gateway-ok"* ]]

echo "[3/4] gateway response header"
headers="$(curl "${curl_args[@]}" --head "https://${DOMAIN}/")"
printf '%s\n' "${headers}" | grep -qi '^x-animebox-gateway: ru-v1'

echo "[4/4] public small asset"
curl "${curl_args[@]}" --head "https://${DOMAIN}/robots.txt" >/dev/null

echo "AnimeBox RU gateway smoke test passed."
