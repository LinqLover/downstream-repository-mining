import pathExists from 'path-exists'
import path from 'path'

import { NpmDependencySearcher } from './npm-dependencies'
import { OnlyData } from './utils/OnlyData'
import { PackageReferenceSearcher, ReferenceSearcherStrategy } from './references'
import { Package } from './packages'
import { Dependency, DependencySearcher } from './dependencies'


export class Dowdep {
    constructor(init: Partial<OnlyData<Dowdep>>) {
        Object.assign(this, init)
    }

    dependencyLimit?: number
    fileSystem: FileSystem = defaultFileSystem
    githubAccessToken?: string
    githubClient: any
    sourceCacheDirectory!: string
    referenceSearchStrategy: ReferenceSearcherStrategy = 'types'

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
