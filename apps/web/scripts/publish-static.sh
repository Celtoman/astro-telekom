#!/bin/sh
set -eu

publication_root="${PUBLICATION_ROOT:-/publication}"
if [ "$publication_root" != "/publication" ]; then
  echo "PUBLICATION_ROOT must be /publication" >&2
  exit 1
fi

pnpm --filter @provider/web run build

release_id="$(date +%s)-$$"
release_dir="$publication_root/releases/$release_id"
mkdir -p "$release_dir"
cp -a apps/web/dist/. "$release_dir/"

rm -f "$publication_root/current.next"
ln -s "releases/$release_id" "$publication_root/current.next"
mv -fT "$publication_root/current.next" "$publication_root/current"

for previous_release in "$publication_root"/releases/*; do
  if [ "$previous_release" != "$release_dir" ]; then
    rm -rf -- "$previous_release"
  fi
done
