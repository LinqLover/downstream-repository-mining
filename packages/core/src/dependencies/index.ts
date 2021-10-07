import { Package } from '../packages'
import { OnlyData } from '../utils/OnlyData'

import { Dependency, DependencySearcher, DependencyUpdateCallback, DependencyUpdateOptions } from './base'
import { NpmDependencySearcher } from './npm'
import { SourcegraphDependencySearcher } from './sourcegraph'


export {
    Dependency,
    DependencySearcher,
    DependencyUpdateCallback,
    DependencyUpdateOptions
}

const ALL_DEPENDENCY_SEARCH_STRATEGIES = [
    'npm',
    'sourcegraph'
] as const
export type DependencySearchStrategy = (typeof ALL_DEPENDENCY_SEARCH_STRATEGIES)[number]

function dependencySearcher(strategy: DependencySearchStrategy) {
    return {
        'npm': NpmDependencySearcher,
        'sourcegraph': SourcegraphDependencySearcher
    }[strategy]
}

export function createDependencySearcher(strategy: DependencySearchStrategy, $package: Package, init: Partial<OnlyData<DependencySearcher>>) {
    return new (dependencySearcher(strategy))($package, init)
}
