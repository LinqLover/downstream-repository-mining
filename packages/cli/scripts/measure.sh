#!/usr/bin/env bash

# usage:
#   $1 - package
# expected vars:
#   SOURCEGRAPH_TOKEN

# measure time
time sh -c "./bin/run.js list $1 --strategies=npm --no-downloadGitHubData --limit -1 > output-$1-npm.txt 2> error-$1-npm.txt"
time sh -c "./bin/run.js list $1 --strategies=sourcegraph --no-downloadGitHubData --limit -1 > output-$1-sourcegraph.txt 2> error-$1-sourcegraph.txt"

# compute intersection
grep '^  name:' "output-$1-npm.txt" > "pkgs-$1-npm.txt"
grep '^  name:' "output-$1-sourcegraph.txt" > "pkgs-$1-sourcegraph.txt"
awk 'a[$0]++' "pkgs-$1-npm.txt" "pkgs-$1-sourcegraph.txt" | wc -l
