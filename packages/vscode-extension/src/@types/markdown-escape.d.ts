declare module 'markdown-escape' {
    // TODO
    /* declare const ALL_CHARACTER_SETS = [
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
    ] as const */

    export type CharacterSet = /* (typeof ALL_CHARACTER_SETS) */string[number]

    export default function markdownEscape(string: string, skips?: CharacterSet[]): string
}
