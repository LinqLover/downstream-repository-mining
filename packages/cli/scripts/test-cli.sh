#!/usr/bin/env bash
set -e

fail() {
    >&2 echo "$1"
    exit 1
}

bin="./bin/run.js"


# First round: Does the help output look plausible?
output="$($bin help)"
echo "$output"

commands="$(echo "$output" | sed -n '/^COMMANDS$/,$p' | sed -n '/^  /p')"
number_of_commands="$(echo "$commands" | wc -l)"

(( number_of_commands > 4 )) || fail "not enough commands provided"


# Second round: Let's do a real world acceptance test
packageName="cheerio"
export NPM_CACHE="cache-test"

output=$($bin list --limit 10 --no-downloadGitHubData $packageName)
echo "$output"
[[ $output == *'tarballUrl:'* ]] || fail "list does not output valid hits"

output=$($bin download --limit 10 $packageName)
echo "$output"
[[ $output == *'Download completed, 10 successful'* ]] ||fail "download was not successful"

output=$($bin search --limit 10 --strategy heuristic $packageName)
echo "$output"
[[ $output == *'matchString:'* ]] || fail "search heuristic does not output valid hits"

export NPM_CACHE_SRC="$NPM_CACHE-src"
mkdir $NPM_CACHE_SRC
NPM_CACHE="$NPM_CACHE-src" "$(dirname "$0")/download-package.sh" $packageName
output=$($bin search --limit 10 --strategy types --source "$NPM_CACHE_SRC/$packageName" $packageName)
echo "$output"
[[ $output == *'matchString:'* ]] || fail "search types does not output valid hits"
