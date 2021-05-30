import { Command, flags } from '@oclif/command'
import * as path from 'path'
import * as util from 'util'

import Package from '../../package'
import { getCacheDirectory } from '../../npm-deps'
import { ReferenceSearcher } from '../../references'


export default class Search extends Command {
    static description = 'search downstream dependencies for package references'

    static flags = {
        help: flags.help({ char: 'h' }),
        strategy: flags.enum({
            description: "search strategy to use",
            options: ['heuristic', 'types']
        }),
        limit: flags.integer({
            description: "maximum number of references to find (-1 for unlimited)",
            default: undefined
        })
    }

    static args = [{ name: 'packageName' }]

    async run() {
        const { args, flags } = this.parse(Search)

        const packageName: string = args.packageName
        if (!packageName) throw new Error("dowdep: Package not specified")
        const limit = flags.limit == -1 ? undefined : flags.limit

        const _package = new Package(packageName)
        _package.directory = path.join(getCacheDirectory(), packageName)
        const searcher = new ReferenceSearcher(_package, undefined, flags.strategy)
        const references = searcher.searchReferences(limit)

        console.log(util.inspect(references, { showHidden: false, depth: null, maxArrayLength: Infinity }))
    }
}
