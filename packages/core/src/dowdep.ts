import pathExists from 'path-exists'
import path from 'path'

import { createDependencySearcher, Dependency, DependencySearcher, DependencySearchStrategy } from './dependencies'
import { Package } from './packages'
import { PackageReferenceSearcher, ReferenceSearchStrategy } from './references'
import { OnlyData } from './utils/OnlyData'


export function getCacheDirectory() {
    return process.env.NPM_CACHE || 'cache'
}

export class Dowdep {
    constructor(init: Partial<OnlyData<Dowdep>>) {
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

        return strategies.map(strategy => createDependencySearcher(strategy, $package, {
            limit: this.dependencyLimit ? this.dependencyLimit / strategies.length : this.dependencyLimit
        }))
    }

    createReferenceSearcher(dependency: Dependency, $package: Package) {
        // TODO: Do we still need $package param?
        return PackageReferenceSearcher.create($package, dependency, this.referenceSearchStrategy)
    }
}

export interface FileSystem {
    exists(path: string): Promise<boolean>
    join(...parts: string[]): string
}

export const defaultFileSystem: FileSystem = {
    exists: pathExists,
    join: path.join
}
