#!/usr/bin/env bash
set -Eeuo pipefail

BUNDLE_PATH="${1:-/tmp/expression-training.tar.gz}"
DOMAIN="${DOMAIN:-ai-rag.online}"
APP_USER="expression-training"
APP_ROOT="/opt/expression-training"
STATE_ROOT="/var/lib/expression-training"
CONFIG_ROOT="/etc/expression-training"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE_ROOT="$APP_ROOT/releases/$STAMP"
CURRENT_LINK="$APP_ROOT/current"
ASR_VENV="$APP_ROOT/asr-venv"
ASR_WHEELHOUSE="${ASR_WHEELHOUSE:-/tmp/expression-training-asr-wheelhouse}"
NGINX_RECOVERY_ROOT="/etc/nginx/expression-training-recovery/$STAMP"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer as root." >&2
  exit 1
fi
if [[ ! -f "$BUNDLE_PATH" ]]; then
  echo "Release bundle not found: $BUNDLE_PATH" >&2
  exit 1
fi
if [[ "$DOMAIN" != "ai-rag.online" ]]; then
  echo "This deployment package is pinned to ai-rag.online." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl nginx certbot python3-certbot-nginx python3 python3-venv python3-pip build-essential

NODE_MAJOR="$(node --version 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)"
if [[ -z "$NODE_MAJOR" || "$NODE_MAJOR" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
  bash /tmp/nodesource_setup.sh
  apt-get install -y nodejs
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$STATE_ROOT" --create-home --shell /usr/sbin/nologin "$APP_USER"
fi
install -d -o "$APP_USER" -g "$APP_USER" -m 0755 "$APP_ROOT/releases"
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$STATE_ROOT" "$STATE_ROOT/db" "$STATE_ROOT/uploads" "$STATE_ROOT/asr-models" "$STATE_ROOT/npm-cache"
install -d -o root -g "$APP_USER" -m 0750 "$CONFIG_ROOT"
install -d -o "$APP_USER" -g "$APP_USER" "$RELEASE_ROOT"
tar -xzf "$BUNDLE_PATH" -C "$RELEASE_ROOT"
chown -R "$APP_USER:$APP_USER" "$RELEASE_ROOT"

runuser -u "$APP_USER" -- env HOME="$STATE_ROOT" npm_config_cache="$STATE_ROOT/npm-cache" npm ci --no-audit --no-fund --prefix "$RELEASE_ROOT"
runuser -u "$APP_USER" -- env HOME="$STATE_ROOT" npm_config_cache="$STATE_ROOT/npm-cache" VITE_API_BASE_URL=/api npm run build:frontend --prefix "$RELEASE_ROOT"

if [[ ! -x "$ASR_VENV/bin/python" ]]; then
  python3 -m venv "$ASR_VENV"
  chown -R "$APP_USER:$APP_USER" "$ASR_VENV"
fi
runuser -u "$APP_USER" -- "$ASR_VENV/bin/python" -m pip install --upgrade pip 'setuptools<81'
PIP_SOURCE_ARGS=()
if [[ -d "$ASR_WHEELHOUSE" ]]; then
  PIP_SOURCE_ARGS=(--no-index --find-links "$ASR_WHEELHOUSE")
fi
runuser -u "$APP_USER" -- "$ASR_VENV/bin/python" -m pip install \
  "${PIP_SOURCE_ARGS[@]}" --requirement "$RELEASE_ROOT/deploy/asr-requirements.txt"

LOCAL_ASR_MODEL_DIR="$STATE_ROOT/asr-models/faster-whisper-small"
ASR_MODEL_VALUE="small"
if [[ -f "$LOCAL_ASR_MODEL_DIR/model.bin" && -f "$LOCAL_ASR_MODEL_DIR/config.json" ]]; then
  ASR_MODEL_VALUE="$LOCAL_ASR_MODEL_DIR"
fi
runuser -u "$APP_USER" -- env ASR_MODEL="$ASR_MODEL_VALUE" ASR_MODEL_ROOT="$STATE_ROOT/asr-models" \
  "$ASR_VENV/bin/python" "$RELEASE_ROOT/server/asr/download_model.py"

ln -sfn "$RELEASE_ROOT" "$CURRENT_LINK"

if [[ ! -f "$CONFIG_ROOT/app.env" ]]; then
  install -o root -g "$APP_USER" -m 0640 "$RELEASE_ROOT/deploy/production.env.example" "$CONFIG_ROOT/app.env"
fi
if [[ ! -f "$CONFIG_ROOT/asr.env" ]]; then
  install -o root -g "$APP_USER" -m 0640 "$RELEASE_ROOT/deploy/asr.env.example" "$CONFIG_ROOT/asr.env"
fi
sed -i -E "s|^ASR_MODEL=.*$|ASR_MODEL=$ASR_MODEL_VALUE|" "$CONFIG_ROOT/asr.env"
sed -i -E "s|^ASR_MODEL_ROOT=.*$|ASR_MODEL_ROOT=$STATE_ROOT/asr-models|" "$CONFIG_ROOT/asr.env"
chown root:"$APP_USER" "$CONFIG_ROOT/asr.env"
chmod 0640 "$CONFIG_ROOT/asr.env"
install -o root -g root -m 0644 "$RELEASE_ROOT/deploy/systemd/expression-training-api.service" /etc/systemd/system/expression-training-api.service
install -o root -g root -m 0644 "$RELEASE_ROOT/deploy/systemd/expression-training-asr.service" /etc/systemd/system/expression-training-asr.service

NGINX_TARGET="/etc/nginx/sites-available/ai-rag.online.conf"
install -d -o root -g root -m 0750 "$NGINX_RECOVERY_ROOT"
for nginx_path in \
  /etc/nginx/conf.d/rag.conf \
  /etc/nginx/sites-available/rag \
  /etc/nginx/sites-enabled/rag \
  /etc/nginx/snippets/catmatch-location.conf \
  /etc/nginx/snippets/expression-training-legacy-locations.conf \
  "$NGINX_TARGET"; do
  if [[ -e "$nginx_path" || -L "$nginx_path" ]]; then
    relative_path="${nginx_path#/etc/nginx/}"
    install -d -o root -g root -m 0750 "$NGINX_RECOVERY_ROOT/$(dirname "$relative_path")"
    cp -a "$nginx_path" "$NGINX_RECOVERY_ROOT/$relative_path"
  fi
done

for search_dir in /etc/nginx/conf.d /etc/nginx/sites-enabled; do
  while IFS= read -r conflict_file; do
    [[ "$conflict_file" == "/etc/nginx/sites-enabled/ai-rag.online.conf" ]] && continue
    relative_path="${conflict_file#/etc/nginx/}"
    conflict_target="$NGINX_RECOVERY_ROOT/conflicts/$relative_path"
    install -d -o root -g root -m 0750 "$(dirname "$conflict_target")"
    mv "$conflict_file" "$conflict_target"
  done < <(grep -lER "server_name[[:space:]]+([^;]*[[:space:]])?ai-rag\.online([[:space:];]|$)" "$search_dir" 2>/dev/null || true)
done

LEGACY_LOCATIONS_SNIPPET="/etc/nginx/snippets/expression-training-legacy-locations.conf"
if [[ -f /etc/nginx/snippets/catmatch-location.conf ]]; then
  printf '%s\n' 'include /etc/nginx/snippets/catmatch-location.conf;' > "$LEGACY_LOCATIONS_SNIPPET"
else
  : > "$LEGACY_LOCATIONS_SNIPPET"
fi
chown root:root "$LEGACY_LOCATIONS_SNIPPET"
chmod 0644 "$LEGACY_LOCATIONS_SNIPPET"

install -o root -g root -m 0644 "$RELEASE_ROOT/deploy/nginx/ai-rag.online.conf" "$NGINX_TARGET"
ln -sfn "$NGINX_TARGET" /etc/nginx/sites-enabled/ai-rag.online.conf

systemctl daemon-reload
systemctl enable expression-training-asr.service expression-training-api.service
systemctl restart expression-training-asr.service
systemctl restart expression-training-api.service
nginx -t
systemctl enable --now nginx
systemctl reload nginx

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
  ufw allow OpenSSH
  ufw allow 'Nginx Full'
fi

for _ in $(seq 1 120); do
  curl -fsS http://127.0.0.1:9000/health >/dev/null && break
  sleep 2
done
curl -fsS http://127.0.0.1:9000/health
curl -fsS http://127.0.0.1:8787/health
curl -fsS -H "Host: $DOMAIN" http://127.0.0.1/

certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email --redirect -d "$DOMAIN"
nginx -t
systemctl reload nginx
curl -fsS "https://$DOMAIN/api/health"

echo "Deployment completed: https://$DOMAIN/"
echo "Nginx recovery snapshot: $NGINX_RECOVERY_ROOT"
echo "Set DEEPSEEK_API_KEY in $CONFIG_ROOT/app.env if it is not already configured, then restart expression-training-api.service."
