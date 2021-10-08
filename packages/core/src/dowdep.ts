import path from 'path'
import pathExists from 'path-exists'

import { createDependencySearcher, Dependency, DependencySearcher, DependencySearchStrategy } from './dependencies'
import { Package } from './packages'
import { createReferenceSearcher, ReferenceSearchStrategy } from './references'
import { OnlyData } from './utils/OnlyData'


/** This is the starting point and configuration place for the downstream repository miner. */
export class Dowdep {
    constructor(init: Partial<OnlyData<Dowdep>> = {}) {
        Object.assign(this, init)
    }

    dependencyLimit?: number
    fileSystem: FileSystem = defaultFileSystem
    get githubAccessToken() {
        return this._githubAccessToken
    }
    set githubAccessToken(value: string | undefined) {
        this._githubAccessToken = value
        this.githubClient?.tokenChanged(value)
    }
    sourcegraphToken?: string
    githubClient?: {
        tokenChanged: (value: string | undefined) => void
    }
    sourceCacheDirectory!: string
    dependencySearchStrategies: readonly DependencySearchStrategy[] | '*' = '*'
    referenceSearchStrategy: ReferenceSearchStrategy = 'types'

    private _githubAccessToken?: string

    createDependencySearchers($package: Package): readonly DependencySearcher[] {
        const strategies = this.dependencySearchStrategies == '*'
            ? <['npm', 'sourcegraph']>['npm', 'sourcegraph']
            : this.dependencySearchStrategies

        return strategies.map(strategy => createDependencySearcher($package, strategy, {
            limit: this.dependencyLimit ? Math.ceil(this.dependencyLimit / strategies.length) : this.dependencyLimit
        }))
    }

    createReferenceSearcher(dependency: Dependency, $package: Package) {
        // TODO: Do we still need $package param?
        return createReferenceSearcher($package, dependency, this.referenceSearchStrategy)
    }
}

/** Wraps an existing physical or virtual filesystem. In preparation for supporting VS Code's virtual filesystem for github.dev. */
export interface FileSystem {
    exists(path: string): Promise<boolean>
    join(...parts: string[]): string
}

export const defaultFileSystem: FileSystem = {
    exists: pathExists,
    join: path.join
}
