import { Command, flags } from '@oclif/command'
import tqdm from 'ntqdm'

import { getNpmDeps, downloadDep } from '../../npm-deps'


export default class Download extends Command {
    static description = 'download downstream dependencies'

    static flags = {
        help: flags.help({ char: 'h' }),
        limit: flags.integer({
            description: "maximum number of packages to download (-1 for unlimited)",
            default: 20
        })
    }

    static args = [{ name: 'packageName' }]

    async run() {
        const { args, flags } = this.parse(Download)

        const packageName: string = args.packageName;
        if (!packageName) throw new Error("dowdep: Package not specified")
        const limit = flags.limit == -1 ? undefined : flags.limit

        const deps = await getNpmDeps(packageName, limit)
        const deps = await getNpmDeps(packageName, flags.limit)
        for (const dep of tqdm(deps, {desc: "Downloading packages"})) {
            await downloadDep(dep)
        }

        console.log(`Download of ${deps.length} packages completed`)
    }
}
