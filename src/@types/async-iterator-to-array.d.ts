declare module 'async-iterator-to-array' {
    /** Collects all values from an async iterator and returns them as an array */
    export default function<T>(iterator: AsyncIterator<T>): Promise<T[]>
}
