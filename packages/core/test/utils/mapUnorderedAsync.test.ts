import mapUnorderedAsync from '../../src/utils/mapUnorderedAsync'

import itAll from 'it-all'


describe('mapUnorderedAsync', () => {
    it("should resolve if all elements resolve", async () => {
        function makePromise<T>(x: T, t: number) {
            return new Promise<T>(res => setTimeout(() => res(x), t))
        }

        const results = await itAll(mapUnorderedAsync(
            (
                (
                    () => async function*() {
                        yield* [
                            [1, 500],
                            [2, 100],
                            [3, 1000]
                        ]
                    }
                )()
            )(),
            async ([x, t]) => `result ${(await makePromise(x, t))}`
        ))

        expect(results).toEqual(['result 2', 'result 1', 'result 3'])
    })

    it("should reject if element provider rejects", async () => {
        function makePromise<T>(x: T, t: number) {
            return new Promise<T>(res => setTimeout(() => res(x), t))
        }

        await expect(async () => await itAll(mapUnorderedAsync(
            (
                (
                    () => async function*() {
                        yield* [
                            [1, 500],
                            [2, 100]
                        ]
                        throw new Error("reject")
                    }
                )()
            )(),
            async ([x, t]) => `result ${(await makePromise(x, t))}`
        ))).rejects.toThrow("reject")
    })

    it("should reject if any element rejects", async () => {
        function makePromise<T>(x: T, t: number) {
            return new Promise<T>(res => setTimeout(() => res(x), t))
        }

        await expect(async () => await itAll(mapUnorderedAsync(
            (
                (
                    () => async function*() {
                        yield* [
                            [1, 500],
                            [2, 100],
                            [3, undefined]
                        ]
                    }
                )()
            )(),
            async ([x, t]) => {
                if (!t) {
                    throw new Error("reject")
                }
                return `result ${(await makePromise(x, t))}`
            }
        ))).rejects.toThrow("reject")
    })
})
