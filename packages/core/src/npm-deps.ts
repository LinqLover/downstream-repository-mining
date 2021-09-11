import { Dependency, Dowdep, Package } from '.'


export async function getNpmDeps(packageName: string, limit?: number, downloadGitHubData = false) {
    const dowdep = new Dowdep({
        dependencyLimit: limit,
        githubAccessToken: downloadGitHubData && process.env.GITHUB_OAUTH_TOKEN || undefined
    })
    const $package = new Package(packageName, undefined)
    await $package.updateDependencies(dowdep)
    return $package.dependencies
}

export async function downloadDep(dependency: Dependency) {
    const dowdep = new Dowdep({
        sourceCacheDirectory: getCacheDirectory()
    })
    await dependency.updateSource(dowdep)
}

export function getCacheDirectory() {
    return process.env.NPM_CACHE || 'cache'
}
