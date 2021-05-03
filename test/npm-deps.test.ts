import { getNpmDeps, Dependent } from "../src/npm-deps";


describe("getNpmDeps", () => {
    it.each`
        packageName     | limit  | countNestedDeps  | timeoutSecs  | nonGitHubThreshold
        ${'glob'}       | ${1}   | ${false}         | ${10}        | ${0}
        ${'glob'}       | ${3}   | ${true}          | ${30}        | ${0}
        ${'gl-matrix'}  | ${4}   | ${false}         | ${30}        | ${0}
    `("should return plausible results for $packageName (at least $limit deps)", async ({packageName, limit, timeoutSecs, nonGitHubThreshold}) => {
        jest.setTimeout(timeoutSecs * 1000)

        const deps = <Dependent[]>await getNpmDeps(packageName, limit, true)

        expect(deps).toHaveLength(limit)

        for (const dep of deps) {
            expect(dep.name).toBeTruthy()
            expect(dep.dependentCount).toBeGreaterThanOrEqual(limit)
        }

        expect(deps.filter(dep => dep.github).length).toBeGreaterThanOrEqual(nonGitHubThreshold)

        for (const dep of deps) {
            const github = dep!.github
            if (!dep.github) continue

            expect(github!.name).toBeTruthy()
            expect(github!.owner).toBeTruthy()
            expect(github!.stargazerCount).toBeGreaterThanOrEqual(10)
            expect(github!.forkCount).toBeGreaterThanOrEqual(10)
        }
    });
});
