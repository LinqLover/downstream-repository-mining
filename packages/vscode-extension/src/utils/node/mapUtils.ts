export function getOrSet<TKey, TValue>(map: Map<TKey, TValue>, key: TKey, valueFactory: (key: TKey) => TValue): TValue {
    if (map.has(key)) {
        return <TValue>map.get(key)
    }

    const value = valueFactory(key)
    map.set(key, value)
    return value
}
