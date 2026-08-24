#!/usr/bin/env bash
# NECircle one-shot deploy — run on the VPS
#
# Usage:
#   ./deploy.sh              # pulls main + full rebuild + restart
#   ./deploy.sh --branch dev # deploy a different branch
#   ./deploy.sh --backend    # only re-pull + reinstall backend + restart
#   ./deploy.sh --frontend   # only re-pull + rebuild the React app
#   ./deploy.sh --no-pull    # skip git pull (deploy current working tree)
#
# Prereqs: matches DEPLOYMENT.md — Python 3.11 venv at backend/.venv,
# yarn installed globally, systemd unit "necircle-backend" registered,
# and this script owns the app directory as the "necircle" user.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
BRANCH="main"
DO_BACKEND=true
DO_FRONTEND=true
DO_PULL=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)   BRANCH="$2"; shift 2 ;;
    --backend)  DO_FRONTEND=false; shift ;;
    --frontend) DO_BACKEND=false;  shift ;;
    --no-pull)  DO_PULL=false;     shift ;;
    -h|--help)
      sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
done

log() { printf '\033[1;33m▶ %s\033[0m\n' "$*"; }
ok()  { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
err() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; }

cd "$REPO_DIR"

# ---------- 1. git pull ----------
if $DO_PULL; then
  log "git fetch + checkout $BRANCH + pull --ff-only"
  git fetch --all --prune
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
  ok "code up to date @ $(git rev-parse --short HEAD)"
else
  log "skipping git pull (--no-pull)"
fi

# ---------- 2. backend ----------
if $DO_BACKEND; then
  log "backend: install deps + restart"
  cd "$REPO_DIR/backend"

  if [[ ! -d .venv ]]; then
    err ".venv not found at backend/.venv — follow DEPLOYMENT.md §4 first"
    exit 1
  fi

  # shellcheck disable=SC1091
  source .venv/bin/activate
  pip install --quiet --upgrade pip
  pip install --quiet -r requirements.txt
  deactivate

  if systemctl list-unit-files necircle-backend.service >/dev/null 2>&1; then
    sudo systemctl restart necircle-backend
    sleep 1
    if systemctl is-active --quiet necircle-backend; then
      ok "necircle-backend restarted"
    else
      err "necircle-backend failed to restart — check: sudo journalctl -u necircle-backend -n 50"
      exit 1
    fi
  else
    err "systemd unit 'necircle-backend' not found — see DEPLOYMENT.md §4.3"
    exit 1
  fi
  cd "$REPO_DIR"
fi

# ---------- 3. frontend ----------
if $DO_FRONTEND; then
  log "frontend: yarn install + build"
  cd "$REPO_DIR/frontend"

  if ! command -v yarn >/dev/null 2>&1; then
    err "yarn not installed — see DEPLOYMENT.md §2.2"
    exit 1
  fi

  yarn install --frozen-lockfile
  yarn build

  ok "frontend build ready at frontend/build/"
  cd "$REPO_DIR"
fi

# ---------- 4. smoke test ----------
log "smoke test: GET /api/"
if curl -fsS http://127.0.0.1:8001/api/ | grep -q '"ok":true'; then
  ok "/api/ says ok"
else
  err "/api/ smoke test failed — backend may be crashing"
  sudo journalctl -u necircle-backend -n 30 --no-pager || true
  exit 1
fi

# Nginx doesn't need reloading — it serves frontend/build/ directly and
# forwards /api to the systemd-restarted uvicorn.

echo
ok "deploy complete @ $(git rev-parse --short HEAD) on branch $BRANCH"
echo "  open: https://necircle.in/"
