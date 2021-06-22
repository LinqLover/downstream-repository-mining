#!/usr/bin/env bash
set -e

"$(dirname "$0")/unflavor_md.py" "$1" | pandoc \
	-f markdown \
	--filter=pandoc-xnos \
	--pdf-engine=xelatex \
	--resource-path="$(dirname "$1")" \
	"${@:2}" \
	-
