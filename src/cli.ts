#!/usr/bin/env ts-node
import { Command, flags } from '@oclif/command'
import * as util from 'util'

import { getNpmDeps } from './npm-deps'


class DowdepCommand extends Command {
    static description = 'downstream-repository-mining'

    static flags = {
        version: flags.version({ char: 'v' }),
        help: flags.help({ char: 'h' }),
        limit: flags.integer({
            description: "maximum number of results to return",
            default: 20
        }),
        countNestedDependents: flags.boolean({
            name: 'count-nested-dependents', // TODO: Does not work!
            description: "count nested dependents",
            default: true
        })
    }

    static args = [{ name: 'packageName' }]

    async run() {
        const { args, flags } = this.parse(DowdepCommand)

        const packageName: string = args.packageName;
        if (!packageName) throw new Error("Package not specified");

        const deps = await getNpmDeps(packageName, flags.limit, flags.countNestedDependents)

        console.log(util.inspect(deps, {showHidden: false, depth: null}))
    }
}

DowdepCommand.run().then(
    () => { },
    require('@oclif/errors/handle'))
