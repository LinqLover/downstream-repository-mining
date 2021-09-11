import { Dowdep } from './dowdep'
import { Dependency } from './dependencies'
import { isPromisePending } from 'promise-status-async'
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

    async updateDependencies(dowdep: Dowdep, updateCallback?: () => Promise<void>) {
        const searcher = dowdep.createDependencySearcher(this)

        let allDone = true

        const promises: Promise<void>[] = []
        const generator = searcher.search()
        const pushNext = () => {
            allDone = false
            promises.push(
                (async () => {
                    const result = await generator.next()
                    if (result.done) {
                        return
                    }
                    let dependency = result.value
                    const existingDependency = this._dependencies.find(existingDependency =>
                        existingDependency.name == dependency.name)
                    if (!existingDependency) {
                        this._dependencies.push(dependency)
                        await updateCallback?.()
                    } else {
                        dependency = existingDependency
                    }
                    promises.push((async () => await dependency.update(dowdep, updateCallback))())
                    pushNext()
                })())
        }
        pushNext()

        while (!allDone) {
            await Promise.allSettled(promises)

            allDone = true
            await Promise.all(promises.map(async promise => allDone &&= !await isPromisePending(promise)))
        }
    }
}
