#!/bin/sh
# Yana Web entrypoint — volume ownership fix + privilege drop.
#
# Railway volumes are mounted root-owned, and their documented workaround for
# non-root images is RAILWAY_RUN_UID=0 (start the container as root). Running
# the server as root violates container-hardening-law, so we do what the
# official postgres/redis images do: if we were started as root, chown the
# data dir to the unprivileged user, then drop to it with su-exec before the
# server ever runs. Started as non-root (local docker run --user, default
# image USER), this is a plain pass-through.
set -eu

DATA_DIR="${YANA_DATA_DIR:-/app/tools/yana-web/.yana}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown yana:yana "$DATA_DIR"
  chmod 700 "$DATA_DIR"
  exec su-exec yana:yana "$@"
fi

exec "$@"
