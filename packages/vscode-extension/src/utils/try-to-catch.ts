// COPIED FROM https://github.com/coderaiser/try-to-catch/blob/26a0ba95c71b7bdb710bb678732531dd31549c40/lib/try-to-catch.js due to import errors
// See https://stackoverflow.com/q/68953594/13994294

export default async function tryToCatch(fn: (...args: unknown[]) => any, ...args: any[]): Promise<[error: Error | null, result?: any]> {
    check(fn)

    try {
        return [null, await fn(...args)]
    } catch(e) {
        return [e]
    }
}

function check(fn: (...args: unknown[]) => any) {
    if (typeof fn !== 'function')
        throw Error('fn should be a function!')
}
