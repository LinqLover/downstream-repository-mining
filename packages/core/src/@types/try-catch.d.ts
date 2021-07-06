declare module 'try-catch' {
    /** Functional try-catch wrapper. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export default function tryCatch<T extends any[], U>(fn: (...args: T) => U, ...args: T): [Error] | [null, U]
}
