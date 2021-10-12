/** Get the value from the specified map at the specified key, or if the key is not present in the map, create it and with the result from evaluating the specified value factory.
 *
 * @returns The value at the key in the map (after creating it, if necessary).
 */
export function getOrSet<TKey, TValue>(map: Map<TKey, TValue>, key: TKey, valueFactory: (key: TKey) => TValue): TValue {
    if (map.has(key)) {
        return <TValue>map.get(key)
    }

    const value = valueFactory(key)
    map.set(key, value)
    return value
}
