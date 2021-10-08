import itAll from 'it-all'
import mapManyAsync from '@async-generators/map-many'

import { Dowdep } from './dowdep'
import { Dependency, DependencyUpdateCallback, DependencyUpdateOptions } from './dependencies'
import { Reference } from './references'
import mapUnorderedAsync from './utils/mapUnorderedAsync'


/** A package whose downstream dependencies will be analyzed. */
export class Package {
    constructor(
        public name: string,
        public directory?: string
    ) {
        if (!name) {
            throw new Error(`name must not be empty`)
        }
    }

    private _dependencies: Dependency[] = []
    get dependencies(): readonly Dependency[] {
        return this._dependencies
    }
    get allReferences(): readonly Reference[] {
        return this.dependencies.flatMap(depedendency => depedendency.references)
    }

    /** Fetch and update dependencies for the package asynchronously. After every update step, `updateCallback` is invoked. */
    async updateDependencies(dowdep: Dowdep, options: Partial<DependencyUpdateOptions> = {}, updateCallback?: DependencyUpdateCallback) {
        const searchers = dowdep.createDependencySearchers(this)

        await itAll(mapUnorderedAsync<Dependency, void>(mapManyAsync(searchers, searcher => searcher.search(dowdep)), async dependency => {
            const existingDependency = this._dependencies.find(existingDependency =>
                existingDependency.name == dependency.name)
            if (!existingDependency) {
                this._dependencies.push(dependency)
                await updateCallback?.(dependency, undefined)
            } else {
                dependency = existingDependency
            }
            await dependency.update(dowdep, options, updateCallback)
        }))
        // TODO: Dependency needs a "state" variable for proper asynchronous state checking
    }
}
