#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
API_PORT="${PORT:-9192}"
FRONTEND_PORT="${FRONTEND_PORT:-1024}"
API_PID_FILE="$ROOT_DIR/.api-server.pid"
FRONTEND_PID_FILE="$ROOT_DIR/.frontend-server.pid"
API_LOG_FILE="$ROOT_DIR/.api-server.log"
FRONTEND_LOG_FILE="$ROOT_DIR/.frontend-server.log"

is_running() {
  pid_file="$1"
  if [ ! -f "$pid_file" ]; then
    return 1
  fi

  pid="$(cat "$pid_file")"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

ensure_started() {
  name="$1"
  pid_file="$2"
  log_file="$3"
  port="$4"

  sleep 1
  port_pid="$(find_port_pid "$port")"
  if [ -n "$port_pid" ]; then
    printf '%s\n' "$port_pid" > "$pid_file"
    return
  fi

  printf '%s falhou ao iniciar\n' "$name"
  rm -f "$pid_file"
  if [ -f "$log_file" ]; then
    sed -n '1,80p' "$log_file"
  fi
  exit 1
}

find_port_pid() {
  port="$1"
  ss -ltnp 2>/dev/null | sed -n "s/.*:${port} .*pid=\([0-9][0-9]*\).*/\1/p" | sort -u | sed -n '1p'
}

start_detached() {
  log_file="$1"
  shift

  if command -v setsid >/dev/null 2>&1; then
    setsid nohup "$@" >"$log_file" 2>&1 &
  else
    nohup "$@" >"$log_file" 2>&1 &
  fi
  printf '%s\n' "$!"
}

if is_running "$API_PID_FILE"; then
  printf 'API ja esta rodando em pid %s\n' "$(cat "$API_PID_FILE")"
else
  start_detached "$API_LOG_FILE" env PORT="$API_PORT" node "$ROOT_DIR/server.js" > "$API_PID_FILE"
  ensure_started "API" "$API_PID_FILE" "$API_LOG_FILE" "$API_PORT"
  printf 'API iniciada em http://localhost:%s pid %s\n' "$API_PORT" "$(cat "$API_PID_FILE")"
fi

if is_running "$FRONTEND_PID_FILE"; then
  printf 'Frontend ja esta rodando em pid %s\n' "$(cat "$FRONTEND_PID_FILE")"
else
  start_detached "$FRONTEND_LOG_FILE" env FRONTEND_PORT="$FRONTEND_PORT" "$ROOT_DIR/serve-frontend.sh" > "$FRONTEND_PID_FILE"
  ensure_started "Frontend" "$FRONTEND_PID_FILE" "$FRONTEND_LOG_FILE" "$FRONTEND_PORT"
  printf 'Frontend iniciado em http://localhost:%s pid %s\n' "$FRONTEND_PORT" "$(cat "$FRONTEND_PID_FILE")"
fi

printf 'Logs: %s %s\n' "$API_LOG_FILE" "$FRONTEND_LOG_FILE"
