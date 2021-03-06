import * as _ from 'lodash'
import { flags } from '@oclif/command'
import * as path from 'path'
import * as util from 'util'

import DowdepCommand from '../DowdepCommand'
import { Package, Reference, ReferenceCollector, ReferenceKind, ReferenceSearchStrategy } from 'dowdep'
import tqdm2 from '../utils/tqdm2'


export default class Search extends DowdepCommand {
    static description = 'search downstream dependencies for package references'

    // TODO: Command aliases do not work!
    static flags = {
        help: flags.help({ char: 'h' }),
        source: flags.string({
            description: "source directory of the package (if omitted, it will be searched in the npm cache)",
            default: undefined
        }),
        strategy: flags.enum({
            description: "search strategy to use",
            options: ['heuristic', 'types']
        }),
        includeImports: flags.boolean({
            name: 'include-imports',
            description: "whether also to find import statements for the package (experimental)",
            default: false
        }),
        includeOccurences: flags.boolean({
            name: 'include-occurences',
            description: "whether also to find indirect occurences of package types (experimental)",
            default: false
        }),
        aggregate: flags.boolean({
            description: "if enabled, search results will be counted",
            default: false
        }),
        limit: flags.integer({
            description: "maximum number of references to find (-1 for unlimited)",
            default: undefined
        })
    }

    static args = [{ name: 'packageName' }]

    async run() {
        const { args, flags } = this.parse(Search)

        // Input
        const packageName: string = args.packageName
        if (!packageName) throw new Error("dowdep-cli: Package not specified")
        const packageDirectory = flags.source || undefined
        const strategy = <ReferenceSearchStrategy>flags.strategy
        if (!['heuristic', 'types'].includes(strategy)) {
            throw new Error("Invalid strategy")
        }
        const includeImports = flags.includeImports
        const includeOccurences = flags.includeOccurences
        const aggregate = flags.aggregate
        const limit = flags.limit == -1 ? undefined : flags.limit

        const $package = new Package(
            packageName,
            packageDirectory ?? path.join(this.cacheDirectory, packageName)
        )
        const searcher = new ReferenceCollector($package, this.cacheDirectory, strategy)
        const includeKinds: ReferenceKind[] = ['usage']
        if (includeImports) {
            includeKinds.push('import')
        }
        if (includeOccurences) {
            includeKinds.push('occurence')
        }

        // Processing
        let references = searcher.searchReferences(limit, includeKinds)
        if (aggregate) {
            references = tqdm2(references)
        }
        const allReferences = aggregate && new Array<Reference>()
        for await (const reference of references) {
            console.log(util.inspect(reference, { showHidden: false, depth: null, maxArrayLength: Infinity }))
            if (allReferences && reference.kind == 'usage') {
                allReferences.push(reference)
            }
        }

        // Output
        if (allReferences) {
            const aggregatedReferences = _.chain(allReferences)
                .groupBy(reference => reference.declaration.memberPath)
                .mapValues(memberReferences => _.countBy(memberReferences, 'dependentName'))
                .toPairs()
                .orderBy(([, countedReferences]) => _.sum(Object.values(countedReferences)), 'desc')
                .fromPairs()
                .value()
            console.table(aggregatedReferences)
        }
    }
}
