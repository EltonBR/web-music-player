#!/bin/sh
set -eu

PORT="${FRONTEND_PORT:-1024}"
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
BUSYBOX_BIN="${BUSYBOX_BIN:-$ROOT_DIR/busybox}"

exec "$BUSYBOX_BIN" httpd -f -p "$PORT" -h "$ROOT_DIR/public"
