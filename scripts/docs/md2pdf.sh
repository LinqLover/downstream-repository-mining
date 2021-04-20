#!/bin/bash
set -e

"$(dirname "$0")/unflavor_md.py" "$1" | pandoc \
	-f markdown \
	--pdf-engine=xelatex \
	--resource-path="$(dirname "$1")" \
	"${@:2}" \
	-
