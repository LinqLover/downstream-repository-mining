declare module 'git-clone' {
    export type Options = {
        /**
         * Path to git binary; defaults to `git`.
         */
        git?: string,
        /**
         * When `true`, clone with depth 1.
         */
        shallow?: boolean,
        /**
         * Revision/branch/tag to check out.
         */
        checkout?: string
    }
    
    /**
     * Clone `repo` to `targetPath`, calling `cb` on completion.
     */
    export default function clone(repo: string, targetPath: string, opts?: Options, cb?: (error?: Error) => void): void
    export default function clone(repo: string, opts?: Options, cb?: (error?: Error) => void): void
}