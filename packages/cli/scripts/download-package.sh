#!/bin/bash
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
