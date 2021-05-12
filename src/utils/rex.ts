import assert from 'assert';

/**
 * regular expression utility using template literals
 *
 * Simple Example:
 *
 * ```js
 *     const regex = rex`
 *         ^  // start of string
 *         [a-z]+  // some letters
 *         bla(${/\d+/})
 *         $  // end
 *     /ig`;
 *
 *     console.log(regex); // /^[a-z]+bla(\d+)$/ig
 *     console.log("Totobla58".match(regex)); // [ 'Totobla58' ]
 * ```
 * ## Credits
 * Originally based on the work of:
 * Denys Séguret <cano.petrole@gmail.com>
 * https://github.com/Canop/miaou/blob/803a7fc5ee8a2d36b896aa0ef1deedfd89c1b670/libs/rex.js
 */
export default function(templates: TemplateStringsArray, ...args: (String | RegExp)[]) {
    assert(templates.raw.length == args.length + 1)
    const raws = templates.raw.map(raw => raw
        .replace(/(?<![^\\](?:\\{2})*\\)\s/gm, '')  // remove unescaped whitespace
        .replace(/\/\/.*/gm, '')  // remove comments
    )
    let flags = ""
    for (const arg of args) {
        if (arg instanceof RegExp) {
            flags += arg.flags
        }
    }
    args = args.map(arg => arg instanceof RegExp ? arg.source : arg)
    const raw = raws.shift() + raws.map((template, i) => `${args[i]}${template}`).join('')
	let [, source, newFlags] = raw.match(/^\/?(.*?)(?:\/(\w+))?$/)!;  // extracts source and flags
    flags += newFlags ?? ''
	return new RegExp(source, [...new Set(flags)].join(''));
}
