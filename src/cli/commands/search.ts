import * as _ from 'lodash'
import { Command, flags } from '@oclif/command'
import * as path from 'path'
import * as util from 'util'

import Package from '../../package'
import { getCacheDirectory } from '../../npm-deps'
import { Reference, ReferenceSearcher, ReferenceKind } from '../../references'


export default class Search extends Command {
    static description = 'search downstream dependencies for package references'

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
            name: 'include-imports', // TODO does not work
            description: "whether also to find import statements for the package",
            default: false
        }),
        includeOccurences: flags.boolean({
            name: 'include-occurences',
            description: "whether also to find indirect occurences of package types",
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

        const packageName: string = args.packageName
        if (!packageName) throw new Error("dowdep: Package not specified")
        const packageDirectory = flags.source || undefined
        const strategy = flags.strategy
        const includeImports = flags.includeImports
        const includeOccurences = flags.includeOccurences
        const aggregate = flags.aggregate
        const limit = flags.limit == -1 ? undefined : flags.limit

        const _package = new Package({
            name: packageName,
            directory: packageDirectory ?? path.join(getCacheDirectory(), packageName)
        })
        const searcher = new ReferenceSearcher(_package, undefined, strategy)
        const includeKinds: ReferenceKind[] = ['usage']
        if (includeImports) {
            includeKinds.push('import')
        }
        if (includeOccurences) {
            includeKinds.push('occurence')
        }
        const references = searcher.searchReferences(limit, includeKinds)

        const allReferences = aggregate && new Array<Reference>()
        for await (const reference of references) {
            console.log(util.inspect(reference, { showHidden: false, depth: null, maxArrayLength: Infinity }))
            if (allReferences && reference.kind == 'usage') {
                allReferences.push(reference)
            }
        }
        if (allReferences) {
            const aggregatedReferences = _.chain(allReferences)
                .groupBy(reference => reference.memberName)
                .mapValues(memberReferences => _.countBy(memberReferences, 'dependentName'))
                .toPairs()
                .orderBy(([, countedReferences]) => _.sum(Object.values(countedReferences)), 'desc')
                .fromPairs()
                .value()
            console.table(aggregatedReferences)
        }
    }
}
