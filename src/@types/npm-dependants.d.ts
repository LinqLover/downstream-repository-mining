declare module 'npm-dependants' {
    /** Get dependants of a module on npm. */
    export default function npmDependants(name: string): AsyncIterable<string>
}
