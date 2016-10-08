#!/usr/bin/env bash
mkdir -p node_modules
for f in .modules/*.tgz; do tar -zxf "$f" -C node_modules/; done
