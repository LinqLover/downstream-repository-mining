import { flags } from '@oclif/command'

import DowdepCommand from '../DowdepCommand'


export default class List extends DowdepCommand {
    static description = 'list downstream dependencies'

    static flags = {
        help: flags.help({ char: 'h' }),
        limit: flags.integer({
            description: "maximum number of results to return (-1 for unlimited)",
            default: 20
        }),
        downloadGitHubData: flags.boolean({
            name: 'download-github-metadata', // TODO: Does not work!
            description: "download GitHub metadata",
            default: true,
            allowNo: true
        })
    }

    static args = [{ name: 'packageName' }]

    async run() {
        const { args, flags } = this.parse(List)

        const packageName: string = args.packageName
        if (!packageName) throw new Error("dowdep-cli: Package not specified")
        const limit = flags.limit == -1 ? undefined : flags.limit
        const downloadGitHubData = flags.downloadGitHubData

        try { for await (const dependency of this.updateDependencies(
            packageName,
            limit,
            dependency => !downloadGitHubData || dependency.isGitHubRepositoryReady,
            {
                downloadMetadata: downloadGitHubData,
                downloadSource: false
            }
        )) {
            console.dir(dependency, {
                showHidden: false,
                depth: 1
            })
        } }catch (e) {console.error("Soemehing wore tnwong", e)}
    }
}
