#!/usr/bin/env bash

# measure and compare the time for both data sources to fetch dependencies
# usage:
#   $1 - package
# expected vars:
#   SOURCEGRAPH_TOKEN

# measure time
time sh -c "./bin/run.js list $1 --strategies=npm --no-downloadGitHubData --limit -1 > output/output-$1-npm.txt 2> output/error-$1-npm.txt"
time sh -c "./bin/run.js list $1 --strategies=sourcegraph --no-downloadGitHubData --limit -1 > output/output-$1-sourcegraph.txt 2> output/error-$1-sourcegraph.txt"

# compute intersection
grep '^  name:' "output/output-$1-npm.txt" > "output/pkgs-$1-npm.txt"
grep '^  name:' "output/output-$1-sourcegraph.txt" > "output/pkgs-$1-sourcegraph.txt"
awk 'a[$0]++' "output/pkgs-$1-{npm,sourcegraph}.txt" | wc -l
