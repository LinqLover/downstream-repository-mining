import assert from 'assert'
import { MarkdownString } from 'vscode'


export default function (templates: TemplateStringsArray, ...args: (string | MarkdownString | any)[]) {
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
