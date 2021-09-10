import { Dowdep } from './dowdep'
import { Dependency } from './dependencies'
import { isPromisePending } from 'promise-status-async'


export class Package {
    constructor(
        public name: string,
        public directory: string
    ) {
        if (!name) {
            throw new Error(`name must not be empty`)
        }
    }

    _dependencies: Dependency[] = []
    get dependencies(): ReadonlyArray<Dependency> { return this._dependencies }

    async updateDependencies(dowdep: Dowdep, updateCallback: () => Promise<void>) {
        const searcher = dowdep.createDependencySearcher(this)
        /*for await (const dependency of searcher.search()) {
            const existingDependency = this._dependencies.find(existingDependency => existingDependency.name == dependency.name)
            if (existingDependency) {
                continue
            }

            this._dependencies.push(dependency)
            await updateCallback()
        } */

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
                    const existingDependency = this._dependencies.find(existingDependency => existingDependency.name == dependency.name)
                    if (!existingDependency) {
                        this._dependencies.push(dependency)
                        await updateCallback()
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
