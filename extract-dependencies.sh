#!/usr/bin/env bash
mkdir -p node_modules
for f in dependencies/.bin.tgz dependencies/*.tgz; do
  tar -zxf "$f" -C .
done
