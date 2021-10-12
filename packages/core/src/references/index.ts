import { strict as assert } from 'assert'
import { promises as fsPromises, Dirent } from 'fs'
import { Dependency } from '../dependencies'
import { Package } from '../packages'
import path from 'path'

import { ALL_REFERENCE_KINDS, Reference, ReferenceKind } from './base'
import { HeuristicReferenceSearcher } from './heuristic'
import { TypeReferenceSearcher } from './types'
import fsExists from '../utils/fs.exists'

export {
    DeclarationLocation,
    FilePosition,
    FilePositionPrimitive,
    Location,
    Reference,
    ReferenceKind,
    ReferenceSearcher
} from './base'


const ALL_REFERENCE_SEARCH_STRATEGIES = [
    'heuristic',
    'types'
] as const
export type ReferenceSearchStrategy = (typeof ALL_REFERENCE_SEARCH_STRATEGIES)[number]

function referenceSearcher(strategy: ReferenceSearchStrategy) {
    switch (strategy) {
        case 'heuristic':
            return HeuristicReferenceSearcher
        case 'types':
            return TypeReferenceSearcher
    }
}

export function createReferenceSearcher($package: Package, dependency: Dependency, strategy: ReferenceSearchStrategy) {
    assert(dependency.sourceDirectory, "Dependency must specify source directory")

    return new (referenceSearcher(strategy))($package, <Dependency & { sourceDirectory: string }>dependency)
}

/** Collects all packages from a `node_modules`-like folder structure and searches references in each package. */
export class ReferenceCollector {
    package: Package
    rootDirectory: string
    searchStrategy: ReferenceSearchStrategy

    constructor($package: Package, rootDirectory: string, searchStrategy: ReferenceSearchStrategy) {
        this.package = $package
        this.rootDirectory = rootDirectory
        this.searchStrategy = searchStrategy
    }

    async* searchReferences(limit?: number, includeKinds: readonly ReferenceKind[] | '*' = ['usage']): AsyncIterable<Reference> {
        yield* this.basicSearchReferences(this.rootDirectory, limit, includeKinds == '*' ? ALL_REFERENCE_KINDS : includeKinds, 0)
    }

    protected async* basicSearchReferences(rootDirectory: string, limit: number | undefined, includeKinds: readonly ReferenceKind[] | '*', depth: number): AsyncIterable<Reference> {
        if (!await fsExists(path.join(rootDirectory, 'package.json'))) {
            // Search recursively
            let depDirectories: Iterable<Dirent> = []
            try {
                depDirectories = (
                    await fsPromises.readdir(rootDirectory, { withFileTypes: true })
                ).filter(dirent => dirent.isDirectory)
            } catch (ex) {
                console.error(ex)
            }

            let i = 0
            for await (const depDirectory of depDirectories) {
                for await (const reference of this.basicSearchReferences(path.join(rootDirectory, depDirectory.name), undefined, includeKinds, depth + 1)) {
                    yield reference
                    if (limit && ++i >= limit) {
                        return
                    }
                }
            }
            return
        }

        const dependency = new Dependency(path.basename(rootDirectory), new Package("hack", path.dirname(rootDirectory)))
        dependency.sourceDirectory = rootDirectory
        const searcher = createReferenceSearcher(
            this.package,
            dependency,
            this.searchStrategy
        )
        searcher.includeKinds = includeKinds
        await searcher.initialize()
        yield* searcher.searchReferences()
    }
}
