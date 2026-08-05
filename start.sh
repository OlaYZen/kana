#!/usr/bin/env bash
#
# Install, update and run Kana Practice.
#
#   ./start.sh                    update, install if needed, serve on :5556
#   ./start.sh --port 9000        a different port
#   ./start.sh --host 127.0.0.1   this machine only
#   ./start.sh --no-pull          skip git pull
#   ./start.sh --reload           auto-reload on source changes (development)
#
# Listens on 0.0.0.0 by default so a phone on the same network can reach it —
# which the flick drills need, since they only appear on a touch device. That
# does mean anything on the network can reach it, over plain HTTP: fine on a
# home network, not something to expose to one you don't trust. --host
# 127.0.0.1 puts it back to this machine only.
#
# Safe to run repeatedly: everything it does is conditional on actually being
# out of date.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$ROOT/backend/venv"
REQS="$ROOT/backend/requirements.txt"
STAMP="$ROOT/backend/.requirements.sha"

PORT=5556
HOST=0.0.0.0
PULL=1
RELOAD=0

while [ $# -gt 0 ]; do
  case "$1" in
    --port)    PORT="${2:?--port needs a value}"; shift 2 ;;
    --host)    HOST="${2:?--host needs a value}"; shift 2 ;;
    --no-pull) PULL=0; shift ;;
    --reload)  RELOAD=1; shift ;;
    -h|--help) sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
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
# Printing "0.0.0.0" is no use to someone trying to reach this from a phone,
# so work out the address that actually routes there.
if [ "$HOST" = "0.0.0.0" ]; then
  LAN="$("$PY" - <<'EOF' 2>/dev/null || true
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    # TEST-NET-1. UDP connect only picks the outbound interface; nothing is sent.
    s.connect(("192.0.2.1", 1))
    print(s.getsockname()[0])
except OSError:
    pass
finally:
    s.close()
EOF
)"
  say "Serving on:"
  printf '      http://localhost:%s\n' "$PORT"
  if [ -n "$LAN" ]; then
    printf '      http://%s:%s   ← phones and other devices on this network\n' "$LAN" "$PORT"
  else
    warn "Could not work out this machine's network address — try 'hostname -I'."
  fi
  printf '    Ctrl-C to stop.\n'
else
  say "Serving on http://$HOST:$PORT  (Ctrl-C to stop)"
fi
cd "$ROOT"
ARGS=(-m uvicorn backend.app.main:app --host "$HOST" --port "$PORT")
[ "$RELOAD" = 1 ] && ARGS+=(--reload)
exec "$VPY" "${ARGS[@]}"
