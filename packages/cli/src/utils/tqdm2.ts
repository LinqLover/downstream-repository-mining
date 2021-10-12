import { SingleBar } from 'cli-progress'


type Options = {
    description?: string
}

/** Transparent wrapper to iterate the `iterable`. As a side effect, print progress updates to the console. Inspired by Python's tqdm and JavaScript's (not-so-well working) ntqdm. */
export default async function *tqdm2<T>(iterable: AsyncIterable<T>, length?: number, options: Options = {}): AsyncGenerator<T> {
    const bar = new SingleBar({
        format: `${
            options.description ? `${options.description} ` : ""
        }[{bar}] {percentage}% | ETA: {eta}s | {value}/{total}`
    })

    let index: number
    bar.start(length ?? 1, index = 0)
    try {
        for await (const item of iterable) {
            bar.update(++index)
            if (!length) {
                bar.setTotal(index + 1)
            }
            yield item
        }
    } finally {
        bar.setTotal(index)
        bar.stop()
    }
}
