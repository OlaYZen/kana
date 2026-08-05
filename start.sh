#!/usr/bin/env bash
#
# Install, update and run Kana Practice.
#
#   ./start.sh                 update, install if needed, serve on :8000
#   ./start.sh --port 9000     a different port
#   ./start.sh --no-pull       skip git pull
#   ./start.sh --reload        auto-reload on source changes (development)
#
# Safe to run repeatedly: everything it does is conditional on actually being
# out of date.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$ROOT/backend/venv"
REQS="$ROOT/backend/requirements.txt"
STAMP="$ROOT/backend/.requirements.sha"

PORT=8000
HOST=127.0.0.1
PULL=1
RELOAD=0

while [ $# -gt 0 ]; do
  case "$1" in
    --port)    PORT="${2:?--port needs a value}"; shift 2 ;;
    --host)    HOST="${2:?--host needs a value}"; shift 2 ;;
    --no-pull) PULL=0; shift ;;
    --reload)  RELOAD=1; shift ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
done

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m==>\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m==>\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- python
PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null; then
    PY="$c"; break
  fi
done
[ -n "$PY" ] || die "Python 3.10+ is required but was not found on PATH."
say "Using $("$PY" --version 2>&1)"

# ---------------------------------------------------------------- update
if [ "$PULL" = 1 ] && [ -d "$ROOT/.git" ]; then
  if ! command -v git >/dev/null 2>&1; then
    warn "git not found — skipping update."
  elif [ -n "$(git -C "$ROOT" status --porcelain 2>/dev/null)" ]; then
    # Pulling over local edits is how you lose them; leave it to the user.
    warn "Local changes present — skipping git pull."
  elif ! git -C "$ROOT" remote get-url origin >/dev/null 2>&1; then
    warn "No 'origin' remote — skipping git pull."
  else
    say "Updating from git…"
    git -C "$ROOT" pull --ff-only || warn "git pull failed — continuing with the current checkout."
  fi
fi

# ---------------------------------------------------------------- venv
if [ ! -x "$VENV/bin/python" ]; then
  say "Creating virtualenv at backend/venv…"
  "$PY" -m venv "$VENV" || die "Could not create the virtualenv. On Debian/Ubuntu: apt install python3-venv"
fi
VPY="$VENV/bin/python"

# Reinstall only when requirements.txt actually changed since the last install.
want="$("$PY" - "$REQS" <<'EOF'
import hashlib, sys
print(hashlib.sha256(open(sys.argv[1], 'rb').read()).hexdigest())
EOF
)"
have="$(cat "$STAMP" 2>/dev/null || true)"

if [ "$want" != "$have" ] || ! "$VPY" -c 'import fastapi, uvicorn' >/dev/null 2>&1; then
  say "Installing dependencies…"
  "$VPY" -m pip install --quiet --upgrade pip
  "$VPY" -m pip install --quiet -r "$REQS" || die "Dependency install failed."
  printf '%s' "$want" > "$STAMP"
else
  say "Dependencies already up to date."
fi

# ---------------------------------------------------------------- run
say "Serving on http://$HOST:$PORT  (Ctrl-C to stop)"
cd "$ROOT"
ARGS=(-m uvicorn backend.app.main:app --host "$HOST" --port "$PORT")
[ "$RELOAD" = 1 ] && ARGS+=(--reload)
exec "$VPY" "${ARGS[@]}"
