export default class Package {
    constructor(init: Package) {
        Object.assign(this, init)
    }

    name!: string
    directory!: string
}
