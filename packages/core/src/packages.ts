import itAll from 'it-all'
import mapAsync from '@async-generators/map'

import { Dowdep } from './dowdep'
import { Dependency, DependencyUpdateCallback, DependencyUpdateOptions } from './dependencies'
import { Reference } from '.'


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
    get dependencies(): ReadonlyArray<Dependency> {
        return this._dependencies
    }
    get allReferences(): ReadonlyArray<Reference> {
        return this.dependencies.flatMap(depedendency => depedendency.references)
    }

    async updateDependencies(dowdep: Dowdep, options: Partial<DependencyUpdateOptions> = {}, updateCallback?: DependencyUpdateCallback) {
        const searcher = dowdep.createDependencySearcher(this)

        await itAll(mapAsync<Dependency, void>(searcher.search(), async dependency => {
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
    }
}
