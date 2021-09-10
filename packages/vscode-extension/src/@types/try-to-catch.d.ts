declare module 'try-to-catch' {
    /** Functional try-catch wrapper for promises. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    //export default function tryToCatch<T extends any[], U>(fn: (...args: T) => Promise<U>, ...args: T): Promise<[Error] | [null, U]>
    // TODO: add type guard (https://github.com/coderaiser/try-to-catch/issues/3)

    /* export default function tryToCatch<PromiseData, FnArgs extends any[]>(
        fn: (...args: FnArgs) => Promise<PromiseData>,
        ...fnArgs: FnArgs
    ): Promise<[Error] | [null, PromiseData]> */

    /* function tryToCatch<Data, FnArgs extends any[]>(
        fn: (...args: FnArgs) => Data,
        ...fnArgs: FnArgs
    ): Promise<[Error] | [null, Data]>;

    export = tryToCatch */

    export default function tryToCatch(fn: (...args: unknown[]) => any, ...args: any[]): Promise<[error: Error, result?: any]>;
}
