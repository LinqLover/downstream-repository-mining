import { flags } from '@oclif/command'
import itAll from 'it-all'

import DowdepCommand from '../DowdepCommand'
import tqdm2 from '../utils/tqdm2'


export default class Download extends DowdepCommand {
    static description = 'download downstream dependencies'

    static flags = {
        help: flags.help({ char: 'h' }),
        limit: flags.integer({
            description: "maximum number of packages to download (-1 for unlimited)",
            default: 20
        }),
        strategies: flags.enum({
            description: "list strategies to use",
            options: ['npm', 'sourcegraph', 'all'],
            default: 'all'
        })
    }

    static args = [{ name: 'packageName' }]

    async run(): Promise<void> {
        const { args, flags } = this.parse(Download)

        // Input
        const packageName: string = args.packageName
        if (!packageName) throw new Error("dowdep-cli: Package not specified")
        const limit = flags.limit == -1 ? undefined : flags.limit
        const strategies = ['npm', 'sourcegraph'].includes(flags.strategies)
            ? [<'npm' | 'sourcegraph'>flags.strategies]
            : <['npm', 'sourcegraph']>['npm', 'sourcegraph']

        // Processing
        const dependencies = await itAll(
            tqdm2(
                this.updateDependencies(
                    packageName,
                    strategies,
                    limit,
                    async (dependency, dowdep) => await dependency.isSourceCodeReady(dowdep),
                    { downloadSource: true }
                ),
                limit, {
                    description: "Downloading packages"
                }
            )
        )

        // Output
        console.log(`Download completed, ${dependencies.length} successful`)
    }
}
