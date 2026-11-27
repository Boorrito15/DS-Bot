#!/usr/bin/env bash
# A test copy of the server for trying a branch before it goes live.
#
# It runs the checkout in this repository on its own port, with its own DSH home,
# so it cannot see the live team, the live chats or the live memory. Start it on a
# branch, click around in a browser, stop it, switch branches, start it again.
#
#   scripts/test-server.sh start            # this checkout, on the branch you are on
#   scripts/test-server.sh start <branch>   # switch the checkout to that branch, then start
#   scripts/test-server.sh stop
#   scripts/test-server.sh status
#
# A Bot needs a model that answers. For a test team with no key, run the mock model and
# point the server at it:
#   node ds-bot/dev/mock-llm.mjs &
#   DS_BOT_TEST_MODEL_URL=http://127.0.0.1:8799/v1 scripts/test-server.sh start
#
# To open it to another computer over Tailscale:
#   DS_BOT_TEST_HOST=0.0.0.0 DS_BOT_TEST_TRUSTED_HOST=aldens-mac-mini.tailef7269.ts.net \
#     scripts/test-server.sh start
#
# The home is <repo>/.test-server, which git ignores. Deleting it throws the test
# team away; nothing in it is worth keeping.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="$REPO/.test-server"
LOG="$HOME_DIR/server.log"
PORT="${DS_BOT_TEST_PORT:-61830}"
# Loopback by default; a host name or 0.0.0.0 lets another computer reach it.
BIND_HOST="${DS_BOT_TEST_HOST:-127.0.0.1}"
PID_FILE="$HOME_DIR/server.pid"

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; }

running() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

status() {
  if running; then
    echo "running on http://127.0.0.1:$PORT (pid $(cat "$PID_FILE"))"
    echo "branch: $(git -C "$REPO" rev-parse --abbrev-ref HEAD)"
    echo "log: $LOG"
  else
    echo "not running"
  fi
}

start() {
  local branch="${1:-}"
  if running; then echo "already running; stop it first"; status; exit 0; fi
  if [ -n "$branch" ]; then
    # A dirty checkout would carry half-finished edits onto the other branch.
    if [ -n "$(git -C "$REPO" status --porcelain)" ]; then
      echo "the checkout has uncommitted changes; commit or stash them before switching branches"
      exit 1
    fi
    git -C "$REPO" fetch origin --quiet && git -C "$REPO" checkout "$branch" --quiet
  fi
  mkdir -p "$HOME_DIR"
  # A profile starts with the harness only. DS Bot is this repository, by file: so the
  # server runs the code we are editing rather than a copy of it.
  local profile="$HOME_DIR/profiles/web"
  if [ ! -f "$profile/package.json" ]; then
    echo "first run: creating the test profile with DS Bot from this checkout"
    DSH_HOME="$HOME_DIR" /opt/homebrew/bin/dsh --profile web --help >/dev/null 2>&1 || true
  fi
  node - "$profile/package.json" "$REPO/ds-bot" <<'NODE'
const [file, plugin] = process.argv.slice(2)
const fs = require('node:fs')
const pkg = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { name: 'dsh-profile-web', private: true }
pkg.dependencies = { ...(pkg.dependencies ?? {}), 'ds-bot': `file:${plugin}` }
pkg.dsh ??= {}
pkg.dsh.profile ??= {}
pkg.dsh.profile.bundles ??= ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']
if (!pkg.dsh.profile.bundles.includes('ds-bot')) pkg.dsh.profile.bundles.push('ds-bot')
fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
NODE
  ( cd "$profile" && PATH="/opt/homebrew/bin:$PATH" npm install --no-audit --no-fund >/dev/null 2>&1 ) || true
  echo "starting on branch $(git -C "$REPO" rev-parse --abbrev-ref HEAD), port $PORT"
  : > "$LOG"
  # A model can be pointed at a mock server (dev/mock-llm.mjs) so a Bot can run a real
  # turn without a key or a bill: DS_BOT_TEST_MODEL_URL=http://127.0.0.1:8799/v1.
  local model_env=()
  if [ -n "${DS_BOT_TEST_MODEL_URL:-}" ]; then
    model_env=(DEEPSEEK_BASE_URL="$DS_BOT_TEST_MODEL_URL" DEEPSEEK_API_KEY=mock-key)
  fi
  DSH_HOME="$HOME_DIR" nohup env ${model_env[@]+"${model_env[@]}"} \
    /opt/homebrew/bin/dsh --profile web --host "$BIND_HOST" --port "$PORT" --no-open \
    ${DS_BOT_TEST_TRUSTED_HOST:+--trusted-host "$DS_BOT_TEST_TRUSTED_HOST"} >> "$LOG" 2>&1 &
  echo $! > "$PID_FILE"
  # The address carries a one-time sign-in, so it has to be read back from the log.
  for _ in $(seq 1 60); do
    if grep -qE 'https?://[^ ]*token=' "$LOG" 2>/dev/null; then
      echo "ready: $(grep -oE 'https?://[^ ]*token=[A-Za-z0-9_-]+' "$LOG" | tail -1)"
      return 0
    fi
    if ! running; then echo "it stopped; last lines of $LOG:"; tail -20 "$LOG"; exit 1; fi
    sleep 1
  done
  echo "it is up but printed no address after 60s; look at $LOG"; tail -20 "$LOG"
}

stop() {
  if ! running; then echo "not running"; rm -f "$PID_FILE"; exit 0; fi
  local pid; pid="$(cat "$PID_FILE")"
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
  kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "stopped"
}

case "${1:-}" in
  start) shift; start "${1:-}" ;;
  stop) stop ;;
  status) status ;;
  *) usage; exit 1 ;;
esac
