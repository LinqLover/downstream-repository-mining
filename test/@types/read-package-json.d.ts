declare module 'read-package-json' {
    import { FullMetadata as PackageJson } from 'package-json'

    type CallbackFunction = (err: Error, data: PackageJson) => void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type LoggingFunction = (message?: any, ...optionalParams: any[]) => void

    /** The thing npm uses to read package.json files with semantics and defaults and validation and stuff. */
    export default function readJson(file: string, log_: LoggingFunction, strict_: boolean, cb_: CallbackFunction): void
}
