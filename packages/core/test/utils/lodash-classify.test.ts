import { lodashClassify, lodashClassifyNested } from '../../src/utils/lodash-classify'

describe('lodashClassify', () => {
    it("should work", () => {
        const input = {
            a: [1, 2],
            b: [3, 4]
        }
        const expected = new Map([
            [0, { a: [2], b: [4] }],
            [1, { a: [1], b: [3] }]]
        )

        const actual = lodashClassify(input, (x: number) => x % 2)

        expect(actual).toEqual(expected)
    })
})

describe('lodashClassifyNested', () => {
    it("should work", () => {
        const input = {
            foo: {
                '1': {
                    a: 'i',
                    b: 'i'
                },
                '2': {
                    a: 'ii',
                    b: 'ii'
                }
            },
            bar: {
                '1': {
                    e: 'i'
                },
                '2': {
                    f: 'ii'
                }
            }
        }
        const expected = {
            foo: new Map([
                [2, {
                    '1': {
                        a: 'i',
                        b: 'i'
                    }}],
                [4, {
                    '2': {
                        a: 'ii',
                        b: 'ii'
                    }}]]),
            bar: new Map([
                [2, {
                    '1': {
                        e: 'i'
                    }}],
                [4, {
                    '2': {
                        f: 'ii'
                    }}]])
        }

        const actual = lodashClassifyNested(input, key => +key * 2)

        expect(actual).toEqual(expected)
    })
})
