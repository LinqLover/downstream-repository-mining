import { Command, flags } from '@oclif/command'
import * as util from 'util'

import { getNpmDeps } from '../../npm-deps'


export default class List extends Command {
    static description = 'list downstream dependencies'

    static flags = {
        help: flags.help({ char: 'h' }),
        limit: flags.integer({
            description: "maximum number of results to return",
            default: 20
        }),
        countNestedDependents: flags.boolean({
            name: 'count-nested-dependents', // TODO: Does not work!
            description: "count nested dependents",
            default: true
        }),
        downloadGitHubData: flags.boolean({
            name: 'download-github-metadata', // TODO: Does not work!
            description: "download GitHub metadata",
            default: true
        })
    }

    static args = [{ name: 'packageName' }]

    async run() {
        const { args, flags } = this.parse(List)

        const packageName: string = args.packageName;
        if (!packageName) throw new Error("dowdep: Package not specified");

        const deps = await getNpmDeps(
            packageName,
            flags.limit,
            flags.countNestedDependents,
            flags.downloadGitHubData
        )

        console.log(util.inspect(deps, {showHidden: false, depth: null}))
    }
}
