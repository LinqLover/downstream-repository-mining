#!/usr/bin/env bash
# Validate the example packages used for the tests by compiling and running them.

set -e
shopt -s globstar

for test in ./test/**/*.test/self-test.sh; do
    echo "Running \"${test}\" ..."
    $test
    echo "Completed \"${test}\"."
done
