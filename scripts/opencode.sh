#!/bin/bash
# Start the opencode headless server on the host for Agent mode.
# The backend (in Docker) reaches it via host.docker.internal:4096 and shares
# the agent_sessions directory through a bind mount.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

WORKDIR="$ROOT_DIR/packages/backend/generated/agent_sessions"
PORT="${OPENCODE_PORT:-4096}"
HOSTNAME="${OPENCODE_HOSTNAME:-0.0.0.0}"
CORS="${OPENCODE_CORS:-http://localhost:5173}"

# Resolve the opencode binary: prefer one on PATH, otherwise fall back to the
# project-local copy under .tools/bin (used when the global npm install fails
# to fetch the platform binary, e.g. the optionalDependencies npm bug).
if command -v opencode >/dev/null 2>&1; then
    OPENCODE_BIN="$(command -v opencode)"
elif [ -x "$ROOT_DIR/.tools/bin/opencode" ]; then
    OPENCODE_BIN="$ROOT_DIR/.tools/bin/opencode"
else
    echo "opencode 未安装。安装方式（任选其一）："
    echo "  1) curl -fsSL https://opencode.ai/install | bash"
    echo "  2) brew install sst/tap/opencode"
    exit 1
fi

# opencode reads config from $XDG_CONFIG_HOME (default ~/.config). If that path
# is not writable — e.g. ~/.config is owned by root and you can't sudo — point
# the XDG dirs at a project-local location so opencode never touches $HOME.
CONFIG_BASE="${XDG_CONFIG_HOME:-$HOME/.config}"
if [ -n "${XDG_CONFIG_HOME:-}" ] || { [ -d "$CONFIG_BASE" ] && [ -w "$CONFIG_BASE" ]; } || { [ ! -e "$CONFIG_BASE" ] && [ -w "$HOME" ]; }; then
    : # config dir is usable as-is
else
    echo "~/.config 不可写，改用项目内 XDG 目录（.tools/xdg）。"
    export XDG_CONFIG_HOME="$ROOT_DIR/.tools/xdg/config"
    export XDG_DATA_HOME="${XDG_DATA_HOME:-$ROOT_DIR/.tools/xdg/data}"
    export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$ROOT_DIR/.tools/xdg/cache}"
    export XDG_STATE_HOME="${XDG_STATE_HOME:-$ROOT_DIR/.tools/xdg/state}"
    mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$XDG_STATE_HOME"
fi

mkdir -p "$WORKDIR"
cd "$WORKDIR"

# opencode does NOT auto-load opencode.json from the serve working directory; it
# only reads the global config dir and the project's git root. We therefore
# generate the config from .env here and point OPENCODE_CONFIG at it, so the
# provider is registered the moment the server boots (config is read at startup,
# not hot-reloaded per session).
ENV_FILE="$ROOT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    set -a; . "$ENV_FILE"; set +a
fi

AGENT_BASE_URL="${AGENT_BASE_URL:-https://api.deepseek.com/anthropic}"
DEFAULT_MODEL="${DEFAULT_MODEL:-deepseek-v4-flash}"
OPENCODE_PROVIDER_ID="${OPENCODE_PROVIDER_ID:-cadgw}"
PROVIDER_KEY="${ANTHROPIC_API_KEY:-${GATEWAY_API_KEY:-}}"

if [ -z "$PROVIDER_KEY" ]; then
    echo "缺少 API key：请在 .env 设置 ANTHROPIC_API_KEY 或 GATEWAY_API_KEY。"
    exit 1
fi

CONFIG_FILE="$WORKDIR/opencode.json"
cat > "$CONFIG_FILE" <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "provider": {
    "$OPENCODE_PROVIDER_ID": {
      "npm": "@ai-sdk/anthropic",
      "options": { "baseURL": "$AGENT_BASE_URL", "apiKey": "$PROVIDER_KEY" },
      "models": { "$DEFAULT_MODEL": {} }
    }
  },
  "model": "$OPENCODE_PROVIDER_ID/$DEFAULT_MODEL",
  "permission": {
    "edit": { "*": "deny", "**/cadquery.py": "allow" },
    "bash": "deny",
    "webfetch": "deny"
  }
}
EOF
export OPENCODE_CONFIG="$CONFIG_FILE"

echo "Starting opencode serve in $WORKDIR (port $PORT)..."
echo "Using opencode binary: $OPENCODE_BIN"
echo "Using config: $OPENCODE_CONFIG (provider=$OPENCODE_PROVIDER_ID model=$DEFAULT_MODEL)"
exec "$OPENCODE_BIN" serve --port "$PORT" --hostname "$HOSTNAME" --cors "$CORS"
