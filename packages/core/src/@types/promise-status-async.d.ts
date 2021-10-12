declare module 'promise-status-async' {
    export function isPromisePending<T>(promise: Promise<T>): Promise<boolean>
}
