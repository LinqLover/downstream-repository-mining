export default function isDefined<TValue>(value: TValue | undefined): value is TValue {
    return value !== undefined
}
