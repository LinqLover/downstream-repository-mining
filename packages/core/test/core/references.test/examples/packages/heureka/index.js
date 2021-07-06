var util = require('./util.js')

class Whole {
    primaryPart
    secondaryParts

    constructor(primaryPart, ...secondaryParts) {
        this.primaryPart = primaryPart
        this.secondaryParts = [...secondaryParts]
    }

    getName() {
        return this.primaryPart.name
    }

    lastPart() {
        return this.secondaryParts.slice(-1)[0]
    }
}

class Part {
    name

    constructor(name) {
        this.name = name
    }

    inNewWhole() {
        return new Whole(this)
    }
}

function makeWhole(primaryName, ...secondaryNames) {
    return new Whole(
        new Part(primaryName),
        ...secondaryNames.map(name => new Part(name))
    )
}

module.exports = { Whole, Part, makeWhole, util }
