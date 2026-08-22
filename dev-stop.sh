#!/usr/bin/env bash
# Stop script for GeoMorphosis services started by dev-start.sh
# Attempts graceful shutdown of ai-engine (uvicorn/python), frontend (Next.js/npm), and worker (node/npm)

set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"

# Helpers to list pids matching a pattern (works with pgrep if available, otherwise falls back to ps)
pids_for() {
  local pattern="$1"
  if command -v pgrep >/dev/null 2>&1; then
    pgrep -f -- "$pattern" || true
  else
    ps aux | grep -i -- "$pattern" | grep -v grep | awk '{print $2}' || true
  fi
}

kill_pid() {
  local pid="$1"; local name="$2"
  if [ -z "$pid" ]; then return; fi
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "[$name] PID $pid is not running"
    return
  fi
  echo "[$name] Sending TERM to PID $pid"
  kill "$pid" 2>/dev/null || true
  # Wait up to 5 seconds for graceful exit
  for i in {1..5}; do
    sleep 1
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "[$name] PID $pid exited"
      return
    fi
  done
  echo "[$name] PID $pid did not exit, sending KILL"
  kill -9 "$pid" 2>/dev/null || true
}

stop_service() {
  local svc_name="$1"
  shift
  local patterns=("$@")
  local seen=0
  for pat in "${patterns[@]}"; do
    for pid in $(pids_for "$pat"); do
      if [ -n "$pid" ]; then
        seen=1
        kill_pid "$pid" "$svc_name"
      fi
    done
  done
  if [ "$seen" -eq 0 ]; then
    echo "No running processes found for $svc_name"
  fi
}

echo "Stopping GeoMorphosis services..."

# ai-engine: uvicorn / python -m uvicorn main:app
stop_service "ai-engine" "uvicorn main:app" "-m uvicorn main:app" "python -m uvicorn" "python.exe -m uvicorn"

# frontend: next dev / npm run dev
stop_service "frontend" "npm run dev" "next dev" "node .*next" "node .*node_modules/next"

# worker: node index.js / npm start
stop_service "worker" "npm start" "node .*index.js" "node .*worker"

# Also try to clean up any stray 'npm' or 'node' processes that look like they belong to the repo paths
if command -v pgrep >/dev/null 2>&1; then
  for pid in $(pgrep -f "$ROOT/frontend" || true); do kill_pid "$pid" "frontend"; done
  for pid in $(pgrep -f "$ROOT/worker" || true); do kill_pid "$pid" "worker"; done
  for pid in $(pgrep -f "$ROOT/ai-engine" || true); do kill_pid "$pid" "ai-engine"; done
fi

echo "Stop sequence complete."

exit 0
