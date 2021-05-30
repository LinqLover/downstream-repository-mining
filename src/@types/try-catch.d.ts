declare module 'try-catch' {
    /** Functional try-catch wrapper. */
    export default function tryCatch<T extends any[], U>(fn: (...args: T) => U, ...args: T): [Error] | [null, U]
}
