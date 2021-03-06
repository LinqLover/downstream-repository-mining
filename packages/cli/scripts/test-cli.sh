#!/usr/bin/env bash
# Rough acceptance tests for the CLI.
# Usage:
#   ./test-cli.sh
# Expected vars:
#   GITHUB_OAUTH_TOKEN
#   SOURCEGRAPH_TOKEN

set -e

fail() {
    >&2 echo "❌ $1"
    exit 1
}

bin="./bin/run.js"


# First round: Does the help output look plausible?
echo "$ help"
output="$($bin help 2>&1)"
echo "$output"

commands="$(echo "$output" | sed -n '/^COMMANDS$/,$p' | sed -n '/^  /p')"
number_of_commands="$(echo "$commands" | wc -l)"

(( number_of_commands > 4 )) || fail "not enough commands provided"
echo
echo "✔ Help output looks plausible!"
echo
echo


# Second round: Let's do a real world acceptance test
packageName="cheerio"
export NPM_CACHE="cache-test"

echo "$ list"
output=$($bin list --limit 10 $packageName 2>&1)
echo "$output"
[[ $output =~ Dependency[[:space:]]\{[[:space:]]+name: ]] || fail "list does not output valid hits"
echo

echo "$ download (npm)"
output=$($bin download --limit 7 --strategies npm $packageName 2>&1)
echo "$output"
[[ $output == *'Download completed, 7 successful'* ]] || fail "download was not successful"
echo

echo "$ download (sourcegraph)"
output=$($bin download --limit 6 --strategies sourcegraph $packageName 2>&1)
echo "$output"
[[ $output =~ Download\ completed,\ ([[:digit:]]+)\ successful ]] || fail "download was not successful"
# Some dependencies will be skipped legitimately because they are too large
(( BASH_REMATCH[1] > 0 )) || fail "not any download was successful"
echo

echo "$ search (heuristic)"
output=$($bin search --limit 10 --strategy heuristic $packageName 2>&1)
echo "$output"
[[ $output =~ Dependency[[:space:]]\{[[:space:]]+name: ]] || fail "search heuristic does not output valid hits"
[[ $output != *'ERR_MODULE_NOT_FOUND'* ]] || fail "search heuristic raised node import error"
echo

export NPM_CACHE_SRC="$NPM_CACHE-src"
mkdir $NPM_CACHE_SRC
echo "$ download-package.sh"
NPM_CACHE="$NPM_CACHE-src" "$(dirname "$0")/download-package.sh" $packageName
echo "$ search (types)"
output=$($bin search --limit 10 --strategy types --source "$NPM_CACHE_SRC/$packageName" $packageName 2>&1)
echo "$output"
[[ $output == *'matchString:'* ]] || fail "search types does not output valid hits"
echo


echo
echo "✅ All tests passed!"
