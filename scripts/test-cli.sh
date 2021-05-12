#!/usr/bin/bash
set -e

fail() {
    >&2 echo "$1"
    exit 1
}

output="$(./bin/run.js help)"
echo "$output"

commands="$(echo "$output" | sed -n '/^COMMANDS$/,$p' | sed -n '/^  /p')"
number_of_commands="$(echo "$commands" | wc -l)"

(( $number_of_commands > 10 )) || fail "Not enough commands provided"
