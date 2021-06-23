/** @XXX Cheap and very imprecise workaround for https://github.com/facebook/jest/issues/10276 */
export function printDiff(actual: unknown, expected: unknown, ...context: unknown[]) {
    console.log([...context, ...createDiff(actual, expected)].join("\n"))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function* createDiff(actual: any, expected: any, level = 0): Generator<string> {
    const indent = ' '.repeat(level)

    if (!(expected.sample)) {
        if (actual != expected) {
            // Only show diffs
            yield `${indent}${actual} != ${expected}`
        }
        return
    }
    if (Array.isArray(actual)) {
        for (const expectedObject of expected.sample) {
            yield `${indent}${expectedObject}:`
            if (actual.includes(expectedObject)) {
                continue
            }
            yield `${indent} MISSING: ${expectedObject}`
        }
        return
    }

    for (const [expectedKey, expectedObject] of Object.entries(expected.sample)) {
        yield `${indent}${expectedKey}:`
        if (expectedKey in actual) {
            yield* createDiff(actual[expectedKey], expectedObject, level + 1)
            continue
        }
        yield `${indent} MISSING: ${expectedKey}`
    }
}
