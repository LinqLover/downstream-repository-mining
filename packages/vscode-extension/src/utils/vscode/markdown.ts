import { strict as assert } from 'assert'
import { MarkdownString } from 'vscode'


/**
 * A template literal function that compiles a {@link MarkdownString}.
 *
 * Arguments can be string-like objects (that will be escaped) or further {@link MarkdownString}s.
 *
 * @example ```
 * md`Dear ${this.user}, here is some additional markdown: ${md`${2}nd nested template string`}`
 * ```
 */
export default function (
    templates: TemplateStringsArray,
    ...args: (string | MarkdownString | {
        toString(): string
    })[]
) {
    assert(templates.raw.length === args.length + 1)

    const raws = [...templates.raw]
    const markdownString = new MarkdownString(raws.shift())
    for (const [i, raw] of raws.entries()) {
        const arg = args[i]
        if (arg instanceof MarkdownString) {
            markdownString.appendMarkdown(arg.value)
        } else {
            markdownString.appendText(arg ? arg.toString() : '')
        }
        markdownString.appendMarkdown(raw)
    }
    return markdownString
}
