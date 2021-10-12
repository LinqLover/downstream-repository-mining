#!/usr/bin/env bash
# Download a package from npm. For experimental purposes.
# Usage:
#   ./download-package.sh package
# Expected vars:
#   NPM_CACHE - path to download

set -ex

cd "$NPM_CACHE" || exit 1
tmp="$1.new"
mkdir "$tmp"
cd "$tmp"
npm init -y
npm install "$1"
mv "node_modules/$1" ..
cd ..
rm -r "$tmp"
