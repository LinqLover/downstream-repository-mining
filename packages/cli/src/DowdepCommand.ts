import filterAsync from 'node-filter-async'
import { Command } from '@oclif/command'

import { Dependency, DependencyUpdateOptions, Dowdep, getCacheDirectory, Package } from 'dowdep'

export default abstract class DowdepCommand extends Command {
    async *updateDependencies(
        packageName: string,
        searchStrategies: Dowdep['dependencySearchStrategies'],
        limit: number | undefined,
        readinessPredicate: (dependency: Dependency, dowdep: Dowdep) => boolean | Promise<boolean>,
        updateOptions: Partial<DependencyUpdateOptions>
    ) {
        const dowdep = new Dowdep({
            dependencySearchStrategies: searchStrategies,
            dependencyLimit: limit,
            githubAccessToken: process.env.GITHUB_OAUTH_TOKEN,
            sourcegraphToken: process.env.SOURCEGRAPH_TOKEN,
            sourceCacheDirectory: getCacheDirectory()
        })
        const $package = new Package(packageName)

        const knownDependencies: Dependency[] = []

        // Schedule dependency updates asynchronousl and, stream every dependency back to the caller once it has been updated.
        let yieldResolve: ($new: boolean) => void
        let yieldPromise: Promise<boolean> = new Promise(resolve => yieldResolve = resolve)  // For synchronization between depedency updates and generator
        $package.updateDependencies(dowdep, updateOptions, async () => {
            (await filterAsync(
                [...$package.dependencies],
                async dependency =>
                    !knownDependencies.includes(dependency)
                        && await readinessPredicate(dependency, dowdep))
            ).forEach(dependency =>
                knownDependencies.push(dependency)
                    && yieldResolve(true))
        }).finally(() => {
            yieldResolve(false)
        })

        const yieldedDependencies: Dependency[] = []
        while (true) {
            if (!await yieldPromise) {
                return
            }
            for (const dependency of knownDependencies) {
                if (yieldedDependencies.includes(dependency)) {
                    continue
                }
                yieldedDependencies.push(dependency)
                yield dependency
            }
            yieldPromise = new Promise(resolve => yieldResolve = resolve)
        }
    }
}
