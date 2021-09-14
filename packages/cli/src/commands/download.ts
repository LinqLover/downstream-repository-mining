import { flags } from '@oclif/command'
import asyncIteratorToArray from 'it-all'

import DowdepCommand from '../DowdepCommand'
import tqdm2 from '../utils/tqdm2'


export default class Download extends DowdepCommand {
    static description = 'download downstream dependencies'

    static flags = {
        help: flags.help({ char: 'h' }),
        limit: flags.integer({
            description: "maximum number of packages to download (-1 for unlimited)",
            default: 20
        })
    }

    static args = [{ name: 'packageName' }]

    async run(): Promise<void> {
        const { args, flags } = this.parse(Download)

        const packageName: string = args.packageName
        if (!packageName) throw new Error("dowdep-cli: Package not specified")
        const limit = flags.limit == -1 ? undefined : flags.limit

        const dependencies = await asyncIteratorToArray(
            tqdm2(
                this.updateDependencies(
                    packageName,
                    limit,
                    async (dependency, dowdep) => await dependency.isSourceCodeReady(dowdep),
                    { downloadSource: true }
                ),
                limit, {
                    description: "Downloading packages"
                }
            )
        )

        console.log(`Download completed, ${dependencies.length} successful`)
    }
}
