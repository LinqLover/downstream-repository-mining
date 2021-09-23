export function *flatMap<T, U, This = undefined>(
    iterator: IterableIterator<T>,
    callback: (this: This | undefined, value: T, index: number) => U | readonly U[] | IterableIterator<U>,
    thisArg?: This
): IterableIterator<U> {
    let index = 0
    for (const value of iterator) {
        const result = callback.call(thisArg, value, index++)
        if (isIterable(result)) {
            yield* result
        } else {
            yield result
        }
    }
}

export function includes<T>(iterator: IterableIterator<T>, searchElement: T) {
    for (const element of iterator) {
        if (element === searchElement) {
            return true
        }
    }
    return false
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isIterable<T>(obj: any): obj is Iterable<T> {
    // eslint-disable-next-line eqeqeq
    return obj != null && typeof obj[Symbol.iterator] === 'function'
}

export function *map<T, U, This = undefined>(
    iterator: IterableIterator<T>,
    callback: (this: This | undefined, value: T, index: number) => U,
    thisArg?: This
): IterableIterator<U> {
    let index = 0
    for (const value of iterator) {
        yield callback.call(thisArg, value, index++)
    }
}

export function some<T, This = undefined>(
    iterator: IterableIterator<T>,
    callback: (this: This | undefined, value: T) => boolean,
    thisArg?: This
) {
    for (const value of iterator) {
        if (callback.call(thisArg, value)) {
            return true
        }
    }
    return false
}
