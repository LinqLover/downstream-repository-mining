#!/usr/bin/env bash
# Validate the example packages by compiling and running the example dependents.

set -e

# Make tput a noop if not applicable
tput=":" && tput sgr0 && tput="tput"
op() {
    "$tput" bold && echo "\$ $*" && "$tput" sgr0
    "$@"
}

echo "###### SELF-TEST - '$0' ######"
op cd "$(dirname "$0")/examples/dependents/" || exit 1

for dep in */; do (
    echo "### TEST '$dep' ###"
    op cd "$dep" || exit 1

    op npm install
    uninstall() { op rm -rf node_modules package-lock.json; }
    EXIT() { uninstall; }
    trap 'EXIT' EXIT

    if [ -f tsconfig.json ]; then
        op tsc || true
        clean() { op tsc --build --clean; }
        EXIT() { clean; uninstall; }
    fi

    op node index.js

    echo "### TEST '$dep': PASSED ###"
); done

echo "###### SELF-TEST: ALL PASSED ######"
