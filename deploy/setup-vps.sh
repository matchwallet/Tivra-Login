#!/usr/bin/env bash
#
# Tivra — one-shot VPS bootstrap (Ubuntu 22.04 / 24.04).
#
# What this script does, top to bottom:
#   1.  Installs system packages (Node 24, pnpm, nginx, postgres, ufw, certbot)
#   2.  Configures the firewall (ssh + http/https only)
#   3.  Creates the postgres role + database
#   4.  Creates a dedicated `tivra` system user, clones the repo into /opt/tivra/app
#   5.  Writes /opt/tivra/app/.env.production
#   6.  pnpm install, builds frontend + API, pushes Drizzle schema
#   7.  Installs + starts the tivra-api systemd service
#   8.  Configures nginx (static frontend + /api/* reverse proxy)
#   9.  Obtains a Let's Encrypt TLS cert (optional, controlled by ENABLE_TLS)
#  10.  Installs a daily pg_dump cron backup
#
# Usage:
#   sudo DOMAIN=app.example.com \
#        REPO_URL=https://github.com/you/tivra.git \
#        LETSENCRYPT_EMAIL=you@example.com \
#        bash setup-vps.sh
#
# Re-running is safe (idempotent). To apply code updates later, see the
# "Updating later" section at the bottom of this file.
#

set -euo pipefail

# ───────────────────────────── Configuration ──────────────────────────────
DOMAIN="${DOMAIN:?Set DOMAIN, e.g. DOMAIN=app.example.com}"
REPO_URL="${REPO_URL:?Set REPO_URL to your git remote, e.g. https://github.com/you/tivra.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
ENABLE_TLS="${ENABLE_TLS:-1}"                # set to 0 to skip certbot

APP_USER="${APP_USER:-tivra}"
APP_DIR="${APP_DIR:-/opt/tivra/app}"
BACKUP_DIR="${BACKUP_DIR:-/opt/tivra/backups}"
ENV_FILE="${APP_DIR}/.env.production"

PG_DB="${PG_DB:-tivra}"
PG_USER="${PG_USER:-tivra}"
API_PORT="${API_PORT:-8080}"
NODE_MAJOR="${NODE_MAJOR:-24}"

# ─── Secret resolution (precedence: explicit env var → existing .env file → newly generated)
PG_PASSWORD_OVERRIDE="${PG_PASSWORD:-}"
SESSION_SECRET_OVERRIDE="${SESSION_SECRET:-}"
unset PG_PASSWORD SESSION_SECRET

if [[ -f "$ENV_FILE" ]]; then
  EXISTING_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2- || true)"
  EXISTING_SESSION="$(grep -E '^SESSION_SECRET=' "$ENV_FILE" | head -n1 | cut -d= -f2- || true)"
  # postgresql://user:PASSWORD@host:port/db  — capture the PASSWORD segment
  if [[ "$EXISTING_URL" =~ ^postgresql://[^:]+:(.*)@[^@]+$ ]]; then
    EXISTING_PG_PASSWORD="${BASH_REMATCH[1]}"
  fi
fi

PG_PASSWORD="${PG_PASSWORD_OVERRIDE:-${EXISTING_PG_PASSWORD:-$(openssl rand -hex 24)}}"
SESSION_SECRET="${SESSION_SECRET_OVERRIDE:-${EXISTING_SESSION:-$(openssl rand -hex 48)}}"

# ──────────────────────────── Helpers ─────────────────────────────────────
RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; BLU=$'\033[34m'; RST=$'\033[0m'
log()  { printf "%s==>%s %s\n" "$BLU" "$RST" "$*"; }
ok()   { printf "%s ✓ %s%s\n" "$GRN" "$*" "$RST"; }
warn() { printf "%s ! %s%s\n" "$YLW" "$*" "$RST"; }
die()  { printf "%s ✗ %s%s\n" "$RED" "$*" "$RST" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root (use sudo)."
. /etc/os-release
[[ "$ID" == "ubuntu" ]] || warn "This script targets Ubuntu; detected $ID — continuing anyway."

# ───────────────────── 1. System packages ─────────────────────────────────
log "Installing system packages…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
  curl ca-certificates git build-essential openssl \
  nginx postgresql postgresql-contrib ufw cron

if ! command -v node >/dev/null || [[ "$(node -v | sed 's/v//;s/\..*//')" != "$NODE_MAJOR" ]]; then
  log "Installing Node.js $NODE_MAJOR…"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
command -v pnpm >/dev/null || npm install -g pnpm
ok "Node $(node -v), pnpm $(pnpm -v)"

# ───────────────────── 2. Firewall ────────────────────────────────────────
log "Configuring UFW (ssh + http/https only)…"
ufw allow OpenSSH        >/dev/null
ufw allow 'Nginx Full'   >/dev/null
yes | ufw enable         >/dev/null || true
ok "UFW active."

# ───────────────────── 3. PostgreSQL role + database ──────────────────────
log "Configuring PostgreSQL…"
systemctl enable --now postgresql

# Create or sync the application role. We use:
#   • PGOPTIONS to pass the role name + password as session-local GUCs
#     ('myapp.role' / 'myapp.pw') — keeps secrets off argv and out of logs.
#   • A DO-block that reads those GUCs with current_setting() and uses
#     format(%I, %L) for safe identifier and literal quoting. This handles
#     custom role names with special characters and passwords containing any
#     character (including single quotes).
#   • ALTER ROLE on every run, so .env.production and the live DB password
#     never drift apart — even after a partial-failure rerun.
sudo -u postgres PGOPTIONS="-c myapp.role=${PG_USER} -c myapp.pw=${PG_PASSWORD}" \
  psql -v ON_ERROR_STOP=1 <<'SQL'
DO $do$
DECLARE
  v_role text := current_setting('myapp.role');
  v_pw   text := current_setting('myapp.pw');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', v_role, v_pw);
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', v_role, v_pw);
  END IF;
END
$do$;
SQL
ok "Role ${PG_USER} ready (password synced)."

# Create database (idempotent). CREATE DATABASE can't run inside a transaction
# block, so we shell-gate instead of using IF NOT EXISTS in PL/pgSQL.
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" | grep -q 1; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${PG_DB}\" OWNER \"${PG_USER}\";"
  ok "Created database ${PG_DB}"
fi
sudo -u postgres psql -v ON_ERROR_STOP=1 \
  -c "GRANT ALL PRIVILEGES ON DATABASE \"${PG_DB}\" TO \"${PG_USER}\";" >/dev/null

# ───────────────────── 4. App user + repo ─────────────────────────────────
log "Setting up application user and code…"
if ! id "$APP_USER" >/dev/null 2>&1; then
  adduser --system --group --home "/opt/${APP_USER}" --shell /bin/bash "$APP_USER"
fi
install -d -o "$APP_USER" -g "$APP_USER" "/opt/${APP_USER}" "$BACKUP_DIR"

if [[ ! -d "$APP_DIR/.git" ]]; then
  sudo -u "$APP_USER" git clone --branch "$GIT_BRANCH" "$REPO_URL" "$APP_DIR"
else
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch --all --prune
  sudo -u "$APP_USER" git -C "$APP_DIR" checkout "$GIT_BRANCH"
  sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only
fi
ok "Repo at $APP_DIR ($(sudo -u "$APP_USER" git -C "$APP_DIR" rev-parse --short HEAD))"

# ───────────────────── 5. Environment file ────────────────────────────────
log "Writing $ENV_FILE…"
DB_URL="postgresql://${PG_USER}:${PG_PASSWORD}@localhost:5432/${PG_DB}"
install -o "$APP_USER" -g "$APP_USER" -m 600 /dev/null "$ENV_FILE"
cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=${API_PORT}
DATABASE_URL=${DB_URL}
SESSION_SECRET=${SESSION_SECRET}
EOF
chown "$APP_USER:$APP_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"
ok "Environment configured."

# ───────────────────── 6. Install, build, migrate ─────────────────────────
log "Installing dependencies (pnpm)…"
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && pnpm install --frozen-lockfile"

log "Building frontend + API…"
# Vite's build script requires PORT and BASE_PATH; the values only matter for
# the dev/preview server, not for the static output, but they must be set.
sudo -u "$APP_USER" bash -lc "
  cd '$APP_DIR'
  set -a; source '$ENV_FILE'; set +a
  BASE_PATH=/ PORT=21144 pnpm --filter @workspace/tivra run build
  pnpm --filter @workspace/api-server run build
"
ok "Builds complete."

log "Pushing Drizzle schema to Postgres…"
sudo -u "$APP_USER" bash -lc "
  cd '$APP_DIR'
  set -a; source '$ENV_FILE'; set +a
  pnpm --filter @workspace/db run push
"
ok "Database schema in sync."

# ───────────────────── 7. systemd service ─────────────────────────────────
log "Installing tivra-api.service…"
cat > /etc/systemd/system/tivra-api.service <<EOF
[Unit]
Description=Tivra API server
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/node --enable-source-maps artifacts/api-server/dist/index.mjs
Restart=on-failure
RestartSec=3
StandardOutput=journal
StandardError=journal

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_DIR}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable tivra-api >/dev/null
systemctl restart tivra-api

# Wait for the API to come up
for i in {1..20}; do
  if curl -fsS "http://127.0.0.1:${API_PORT}/api/healthz" >/dev/null 2>&1; then
    ok "API up on :${API_PORT}"
    break
  fi
  sleep 1
  [[ $i -eq 20 ]] && die "API failed to start. Inspect: journalctl -u tivra-api -n 100"
done

# ───────────────────── 8. Nginx site ──────────────────────────────────────
log "Configuring nginx for ${DOMAIN}…"
NGINX_CONF="/etc/nginx/sites-available/tivra"
cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    root ${APP_DIR}/artifacts/tivra/dist/public;
    index index.html;
    client_max_body_size 10m;

    # API → Node
    location /api/ {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    # Hashed Vite assets — long cache
    location /assets/ {
        try_files \$uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/tivra
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
ok "Nginx serving ${DOMAIN}."

# ───────────────────── 9. TLS via Let's Encrypt ───────────────────────────
if [[ "$ENABLE_TLS" == "1" ]]; then
  if [[ -z "$LETSENCRYPT_EMAIL" ]]; then
    warn "ENABLE_TLS=1 but LETSENCRYPT_EMAIL is empty — skipping TLS."
  else
    log "Obtaining Let's Encrypt certificate for ${DOMAIN}…"
    apt-get install -y certbot python3-certbot-nginx
    certbot --nginx -d "$DOMAIN" \
      --non-interactive --agree-tos --redirect \
      -m "$LETSENCRYPT_EMAIL" --no-eff-email || warn "certbot failed — site will run on plain HTTP. Re-run later: sudo certbot --nginx -d ${DOMAIN}"
  fi
else
  warn "ENABLE_TLS=0 — skipping HTTPS setup."
fi

# ───────────────────── 10. Daily pg_dump backup ───────────────────────────
log "Installing daily database backup cron…"
cat > /etc/cron.d/tivra-backup <<EOF
# Daily dump of the tivra database at 03:00 UTC, kept for 14 days.
0 3 * * * ${APP_USER} pg_dump ${PG_DB} | gzip > ${BACKUP_DIR}/tivra-\$(date +\\%F).sql.gz
30 3 * * * ${APP_USER} find ${BACKUP_DIR} -name 'tivra-*.sql.gz' -mtime +14 -delete
EOF
chmod 644 /etc/cron.d/tivra-backup
ok "Backups scheduled in ${BACKUP_DIR}."

# ───────────────────── Done ───────────────────────────────────────────────
SCHEME="http"
[[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]] && SCHEME="https"

cat <<EOF

${GRN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Tivra is live at:  ${SCHEME}://${DOMAIN}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}

  Default admin login:  guru@gmail.com  /  gurusingh
  (Change this immediately from the admin panel.)

  Useful commands:
    sudo systemctl status tivra-api
    sudo journalctl -u tivra-api -f
    sudo systemctl restart tivra-api
    sudo nginx -t && sudo systemctl reload nginx

  Config files written:
    ${ENV_FILE}        (DB url + secrets — chmod 600)
    /etc/systemd/system/tivra-api.service
    /etc/nginx/sites-available/tivra
    /etc/cron.d/tivra-backup

  Updating later (pull new code + rebuild + restart):
    sudo -u ${APP_USER} git -C ${APP_DIR} pull
    sudo -u ${APP_USER} bash -lc "cd ${APP_DIR} && pnpm install --frozen-lockfile && \\
      set -a; source ${ENV_FILE}; set +a; \\
      BASE_PATH=/ PORT=21144 pnpm --filter @workspace/tivra run build && \\
      pnpm --filter @workspace/api-server run build && \\
      pnpm --filter @workspace/db run push"
    sudo systemctl restart tivra-api

EOF
