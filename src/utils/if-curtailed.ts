/**
 * Invoke @param fn and return the result. If the function is curtailed, invoke @param handler before letting things happen.
 *
 * Adoption of Smalltalk's `BlockClosure >> #ifCurtailed:`.
 */
export default function ifCurtailed<T>(fn: () => T, handler: () => void): T {
    let complete = false
    let result: T
    try {
        result = fn()
        complete = true
    } finally {
        if (complete != true) {
            handler()
        }
    }
    return result
}
