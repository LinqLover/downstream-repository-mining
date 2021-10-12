declare module 'read-package-json' {
    import { FullMetadata as PackageJson } from 'package-json'

    type CallbackFunction = (err: Error, data: PackageJson) => void
    type LoggingFunction = (message?: unknown, ...optionalParams: unknown[]) => void

    /** The thing npm uses to read package.json files with semantics and defaults and validation and stuff. */
    export default function readJson(file: string, log_: LoggingFunction, strict_: boolean, cb_: CallbackFunction): void
}
