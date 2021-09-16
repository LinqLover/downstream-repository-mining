import pathExists from 'path-exists'
import path from 'path'

import { NpmDependencySearcher } from './npm-dependencies'
import { OnlyData } from './utils/OnlyData'
import { PackageReferenceSearcher, ReferenceSearcherStrategy } from './references'
import { Package } from './packages'
import { Dependency, DependencySearcher } from './dependencies'


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
    githubClient?: {
        tokenChanged: (value: string | undefined) => void
    }
    sourceCacheDirectory!: string
    referenceSearchStrategy: ReferenceSearcherStrategy = 'types'

    private _githubAccessToken?: string

    createDependencySearcher($package: Package): DependencySearcher {
        return new NpmDependencySearcher($package, {
            limit: this.dependencyLimit
        })
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