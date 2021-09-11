declare module 'markdown-escape' {
    type CharacterSets = [
        'asterisks',
        'number signs',
        'slashes',
        'parentheses',
        'parentheses',
        'square brackets',
        'square brackets',
        'angle brackets',
        'angle brackets',
        'underscores'
    ]

    export type CharacterSet = CharacterSets[number]

    export default function markdownEscape(string: string, skips?: CharacterSet[]): string
}
