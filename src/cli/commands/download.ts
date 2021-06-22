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

    async run(): Promise<void> {
        const { args, flags } = this.parse(Download)

        const packageName: string = args.packageName
        if (!packageName) throw new Error("dowdep: Package not specified")
        const limit = flags.limit == -1 ? undefined : flags.limit

        const deps = await getNpmDeps(packageName, limit)
        let successes = 0
        let errors = 0
        for (const dep of tqdm(deps, { desc: "Downloading packages" })) {
            try {
                await downloadDep(dep)
                successes++
            } catch (error) {
                console.warn(`Download of ${dep.tarballUrl} failed: ${error}. Skipping...`)
                errors++
            }
        }

        console.log(`Download completed, ${successes} successful, ${errors} failed`)
    }
}
