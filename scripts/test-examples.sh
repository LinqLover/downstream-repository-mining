#!/usr/bin/env bash
set -e

for test in ./test/*.test/self-test.sh; do
    echo "Running \"${test}\" ..."
    $test
    echo "Completed \"${test}\"."
done
