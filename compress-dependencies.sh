#!/usr/bin/env bash
mkdir -p dependencies
for f in node_modules/.bin node_modules/*; do
  tar -czf "dependencies/$(basename $f).tgz" "$f"
done
