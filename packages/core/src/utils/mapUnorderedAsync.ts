import { strict as assert } from 'assert'


export default function mapUnorderedAsync<TIn, TOut>(iterable: AsyncIterable<TIn>, fn: (item: TIn) => Promise<TOut>): AsyncIterable<TOut> {
    return {
        [Symbol.asyncIterator]: () => {
            let resolve: () => void, reject: (reason: unknown) => void
            let semaphore = new Promise<void>((res, rej) => [resolve, reject] = [res, rej])
            const results: IteratorResult<TOut>[] = []

            let maxTemp = 0
            let max: number | undefined = undefined
            let done = false
            // eslint-disable-next-line no-async-promise-executor
            new Promise<void>(async (res, rej) => {
                try {
                    const iterator = iterable[Symbol.asyncIterator]()
                    while (!done) {
                        const x = await iterator.next()
                        if (x.done) {
                            done = true
                            max = maxTemp
                            resolve()
                            return res()
                        }
                        maxTemp++
                        fn(x.value).then(result => {
                            results.push({
                                done: false,
                                value: result
                            })
                            resolve()
                        }).catch(err => rej(err))
                    }
                } catch (err) {
                    rej(err)
                }
            }).catch(err => reject(err))

            let i = 0
            return {
                async next() {
                    if (i < results.length) {
                        const result = results[i++]
                        assert(result)
                        return result
                    }
                    if (max && i >= max) {
                        return {
                            done: true,
                            value: void 0
                        }
                    }
                    await semaphore
                    semaphore = new Promise<void>((res, rej) => [resolve, reject] = [res, rej])
                    return this.next()
                }
            }
        }
    }
}
