import assert from 'assert'
import { MarkdownString } from 'vscode'


export function md(templates: TemplateStringsArray, ...args: (string | MarkdownString | {toString(): string})[]) {
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

export function escapeMarkdown(string: string) {
    return md`${string}`.value
}
