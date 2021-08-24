import { getNpmDeps } from './npm-deps'

import { OnlyData } from './utils/OnlyData'

export default class Package {
    constructor(init: OnlyData<Package>) {
        Object.assign(this, init)
    }

    name!: string
    directory!: string

    async* findDependents(limit?: number) {
        // TODO: Make getNpmDeps a true generator
        yield* await getNpmDeps(this.name, limit)
    }
}
