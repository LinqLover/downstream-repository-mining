import { Command, flags } from '@oclif/command'
import * as util from 'util'
import asyncIteratorToArray from "it-all";

import { searchReferences } from '../../npm-deps'


export default class Search extends Command {
    static description = 'search downstream dependencies for package references'

    static flags = {
        help: flags.help({ char: 'h' }),
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

        const references = await asyncIteratorToArray(searchReferences(packageName, undefined, limit))

        console.log(util.inspect(references, {showHidden: false, depth: null, maxArrayLength: Infinity}))
    }
}
