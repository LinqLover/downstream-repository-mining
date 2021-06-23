import _ from "lodash"

type Grouping<TItem> = { [key: string]: TItem[] }

export function lodashClassify<TItem, TGrouping extends Grouping<TItem>, TClassKey>(
    input: TGrouping,
    fn: (item: TItem, key: string) => TClassKey
): Map<TClassKey, TGrouping> {
    const outputs = new Map<TClassKey, Grouping<TItem>>()
    for (const [key, values] of Object.entries(input)) {
        for (const value of values) {
            const classKey = fn(value, key)
            ;(<T>(cb: (output: Grouping<TItem>) => T) => {
                let output = outputs.get(classKey)
                if (output) {
                    return cb(output)
                }
                output = {}
                const result = cb(output)
                outputs.set(classKey, output)
                return result
            })(output => {
                if (!Object.prototype.hasOwnProperty.call(output, key)) {
                    output[key] = [value]
                } else {
                    output[key].push(value)
                }
            })
        }
    }
    return <Map<TClassKey, TGrouping>>outputs
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function lodashClassifyNested<TItem extends object, TGrouping extends { [key: string]: TItem }, TClassKey>(
    input: TGrouping,
    fn: (key: string) => TClassKey
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): { [P in keyof TGrouping]: Map<TClassKey, { [P in keyof TGrouping[keyof TGrouping]]: _.Dictionary<any> }> } {
    return _.mapValues(
        input,
        item => new Map(Array.from(
            lodashClassify(
                _.mapValues(item, _.toPairs),
                (_items, key) => fn(key)),
            ([classKey, allItems]) => ([classKey, _.mapValues(allItems, _.fromPairs)])
        ))
    )
}
