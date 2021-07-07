import { getNpmDeps } from "./npm-deps"

import { OnlyData } from "utils/OnlyData"

export default class Package {
    constructor(init: OnlyData<Package>) {
    }

    name!: string
    directory!: string

    async* findDependents() {
        // TODO: Make getNpmDeps a true generator
        yield* await getNpmDeps(this.name)
    }
}
