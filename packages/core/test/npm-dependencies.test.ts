import { Dowdep, Package } from '../src'


describe('updateDependencies', () => {
    it.each`
        packageName     | limit  | downloadGitHubData  | timeoutSecs  | nonGitHubThreshold
        ${'glob'}       | ${4}   | ${false}            | ${ 60}       | ${null}
        ${'glob'}       | ${4}   | ${true}             | ${120}       | ${0}
        ${'gl-matrix'}  | ${4}   | ${false}            | ${ 60}       | ${null}
        `("should return plausible results for $packageName (at least $limit deps)", async (
        { packageName, limit, downloadGitHubData, timeoutSecs, nonGitHubThreshold }: {
            packageName: string, limit: number, downloadGitHubData: boolean, timeoutSecs: number, nonGitHubThreshold: number | undefined
        }) => {
        jest.setTimeout(timeoutSecs * 1000)

        const dowdep = new Dowdep({
            dependencyLimit: limit,
            githubAccessToken: process.env.GITHUB_OAUTH_TOKEN,
            dependencySearchStrategies: ['npm']
        })
        const $package = new Package(packageName, undefined)
        await $package.updateDependencies(dowdep, { downloadMetadata: downloadGitHubData })

        expect($package.dependencies).toHaveLength(limit)

        for (const dep of $package.dependencies) {
            expect(dep.name).toBeTruthy()
        }

        if (nonGitHubThreshold) {
            expect($package.dependencies.filter(dep => !dep.githubRepository).length).toBeGreaterThanOrEqual(nonGitHubThreshold)
        }

        for (const dep of $package.dependencies) {
            const github = dep.githubRepository
            if (!github) continue

            expect(github.name).toBeTruthy()
            expect(github.owner).toBeTruthy()
            if (downloadGitHubData) {
                expect(github.stargazerCount).toBeGreaterThanOrEqual(10)
                expect(github.forkCount).toBeGreaterThanOrEqual(10)
            }
        }
    }, 60000)
})
