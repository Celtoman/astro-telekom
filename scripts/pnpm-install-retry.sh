#!/bin/sh
set -eu

max_attempts="${PNPM_INSTALL_MAX_ATTEMPTS:-3}"
attempt=1

while true; do
  if pnpm install "$@"; then
    exit 0
  fi

  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "pnpm install failed after ${attempt} attempts" >&2
    exit 1
  fi

  attempt=$((attempt + 1))
  echo "pnpm install failed; retrying with the populated store (attempt ${attempt}/${max_attempts})" >&2
  sleep 5
done
