declare module 'read-package-json' {
    /** The thing npm uses to read package.json files with semantics and defaults and validation and stuff. */
    export default function readJson(file: string, log_: any, strict_: boolean, cb_: ((err: any, data: any) => any)): void
}
