#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
API_PORT="${PORT:-9192}"
FRONTEND_PORT="${FRONTEND_PORT:-1024}"
API_PID_FILE="$ROOT_DIR/.api-server.pid"
FRONTEND_PID_FILE="$ROOT_DIR/.frontend-server.pid"

stop_pid_file() {
  name="$1"
  pid_file="$2"

  if [ ! -f "$pid_file" ]; then
    printf '%s nao esta rodando\n' "$name"
    return
  fi

  pid="$(cat "$pid_file")"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    printf '%s parado pid %s\n' "$name" "$pid"
  else
    printf '%s pid antigo removido\n' "$name"
  fi

  rm -f "$pid_file"
}

stop_port() {
  name="$1"
  port="$2"

  pids="$(ss -ltnp 2>/dev/null | sed -n "s/.*:${port} .*pid=\([0-9][0-9]*\).*/\1/p" | sort -u)"
  if [ -z "$pids" ]; then
    return
  fi

  for pid in $pids; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid"
      printf '%s parado por porta %s pid %s\n' "$name" "$port" "$pid"
    fi
  done
}

stop_pid_file "Frontend" "$FRONTEND_PID_FILE"
stop_pid_file "API" "$API_PID_FILE"
stop_port "Frontend" "$FRONTEND_PORT"
stop_port "API" "$API_PORT"
