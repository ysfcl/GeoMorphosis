#!/usr/bin/env bash
# dev-start.sh
# Starts ai-engine, frontend, and worker in background (for WSL/macOS/Linux).
# Usage:
#   ./dev-start.sh          # start services (installs missing deps as needed)
#   ./dev-start.sh --no-install  # do not run installs

set -euo pipefail

INSTALL=0
# By default do NOT install. Use -Install or --install to enable installs.
case "${1:-}" in
  -Install|-install|--install)
    INSTALL=1
    ;;
  --no-install|-n)
    INSTALL=0
    ;;
  "")
    INSTALL=0
    ;;
  *)
    # unknown flag: treat as no-install but warn
    echo "Warning: unknown option '$1' - proceeding without installing. Use -Install to install."
    INSTALL=0
    ;;
esac

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Detect available python executable by testing candidates. Prefer real python over WindowsApps stub.
PYTHON_BIN=""
PYTHON_ARG=""
candidates=(python3 python py python.exe)
for cmd in "${candidates[@]}"; do
  if command -v "$cmd" >/dev/null 2>&1; then
    candidate_path="$(command -v "$cmd")"
    candidate_arg=""
    if [[ "$cmd" == "py" ]]; then
      candidate_arg="-3"
    fi

    # Test the candidate by asking it for a small Python expression
    if [[ -n "$candidate_arg" ]]; then
      if "$candidate_path" $candidate_arg -c "import sys; print(sys.version)" >/dev/null 2>&1; then
        PYTHON_BIN="$candidate_path"
        PYTHON_ARG="$candidate_arg"
        break
      fi
    else
      if "$candidate_path" -c "import sys; print(sys.version)" >/dev/null 2>&1; then
        PYTHON_BIN="$candidate_path"
        PYTHON_ARG=""
        break
      fi
    fi
  fi
done

if [[ -z "${PYTHON_BIN}" ]]; then
  echo "Python not found or not usable in this shell. Attempted: ${candidates[*]}"
  if command -v where.exe >/dev/null 2>&1; then
    echo "where.exe results:"; where.exe python 2>/dev/null || true; where.exe python3 2>/dev/null || true; where.exe py 2>/dev/null || true
  fi
  echo "Please install Python 3 and ensure it's available in your shell, or run this script from an environment where Python is accessible." >&2
  exit 1
fi

echo "Detected Python: $PYTHON_BIN ${PYTHON_ARG:-}"
load_env() {
  local path="$1"
  [ -f "$path" ] || return
  while IFS= read -r line; do
    line="${line%%#*}"
    [[ -z "$line" ]] && continue
    if ! echo "$line" | grep -q '='; then continue; fi
    key="$(echo "$line" | cut -d= -f1)"
    val="$(echo "$line" | cut -d= -f2- | sed 's/^"\?//;s/"\?$//')"
    export "$key=$val"
  done < "$path"
}

# Load root and frontend env files if present
load_env "$ROOT/.env" || true
load_env "$ROOT/frontend/.env" || true

# Ensure GEOMORPHOSIS_DATA_DIR points to frontend/data by default
if [[ -z "${GEOMORPHOSIS_DATA_DIR:-}" ]]; then
  export GEOMORPHOSIS_DATA_DIR="$ROOT/frontend/data"
  mkdir -p "$GEOMORPHOSIS_DATA_DIR"
fi

mkdir -p "$ROOT/logs"

echo "Using GEOMORPHOSIS_DATA_DIR=$GEOMORPHOSIS_DATA_DIR"

if [[ $INSTALL -eq 1 ]]; then
  echo "Installing dependencies (this may take a while)..."
  # Python venv and pip (use detected python)
  if [[ ! -x "$ROOT/ai-engine/venv/bin/python" && ! -x "$ROOT/ai-engine/venv/Scripts/python.exe" ]]; then
    if [[ -n "$PYTHON_ARG" ]]; then
      "$PYTHON_BIN" $PYTHON_ARG -m venv "$ROOT/ai-engine/venv"
    else
      "$PYTHON_BIN" -m venv "$ROOT/ai-engine/venv"
    fi
  fi

  # Determine venv python path (bin for POSIX, Scripts for Windows)
  if [[ -x "$ROOT/ai-engine/venv/bin/python" ]]; then
    VENV_PY="$ROOT/ai-engine/venv/bin/python"
  else
    VENV_PY="$ROOT/ai-engine/venv/Scripts/python.exe"
  fi

  "$VENV_PY" -m pip install --upgrade pip >/dev/null
  "$VENV_PY" -m pip install -r "$ROOT/ai-engine/requirements.txt"

  # Node deps
  if [[ -f "$ROOT/frontend/package.json" ]]; then
    (cd "$ROOT/frontend" && npm install)
    (cd "$ROOT/frontend" && npx prisma generate) || true
  fi
  if [[ -f "$ROOT/worker/package.json" ]]; then
    (cd "$ROOT/worker" && npm install)
  fi
fi

echo "Starting AI Engine (FastAPI) -> logs/ai-engine.log"
nohup "$VENV_PY" -m uvicorn main:app --reload --port 8000 > "$ROOT/logs/ai-engine.log" 2>&1 &
AI_PID=$!

echo "Starting Frontend (Next.js) -> logs/frontend.log"
nohup bash -lc "cd '$ROOT/frontend' && npm run dev" > "$ROOT/logs/frontend.log" 2>&1 &
FE_PID=$!

echo "Starting Worker (Node) -> logs/worker.log"
export REDIS_HOST=${REDIS_HOST:-localhost}
export AI_ENGINE_URL=${AI_ENGINE_URL:-http://localhost:8000}
nohup bash -lc "cd '$ROOT/worker' && npm start" > "$ROOT/logs/worker.log" 2>&1 &
WK_PID=$!

echo
echo "Started processes:" 
echo "  AI Engine PID: $AI_PID (logs/ai-engine.log)"
echo "  Frontend PID: $FE_PID (logs/frontend.log)"
echo "  Worker PID: $WK_PID (logs/worker.log)"

echo
echo "To follow logs, run for example:"
echo "  tail -F $ROOT/logs/ai-engine.log $ROOT/logs/frontend.log $ROOT/logs/worker.log"

exit 0
