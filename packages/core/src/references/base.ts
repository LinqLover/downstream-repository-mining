import { strict as assert } from 'assert'
import glob from 'glob-promise'

import { Dependency } from '../dependencies'
import { Package } from '../packages'
import { OnlyData } from '../utils/OnlyData'


/** The 2D position of a code snippet in an (extrinsic) file. */
export class FilePosition {
    constructor(init: OnlyData<FilePosition>) {
        Object.assign(this, init)
    }

    row!: number
    column?: number

    /** Convert this instance into a primitive data type that is comparable and hashable by standard ES6 collections such as {@link Map} and {@link Set}. */
    toPrimitive() {
        return this.toString()
    }

    /** Convert this instance into a human-readable string. */
    toString() {
        return this.column ? `${this.row}:${this.column}` : `${this.row}`
    }
}

export type FilePositionPrimitive = ReturnType<typeof FilePosition.prototype.toPrimitive>

/** The address of a code snippet in a file. */
export interface Location {
    file: string
    position: FilePosition,
    memberPath?: string[] | null | undefined

    toString(): string
}

/** The address of a code snippet for a reference with a definite member path. */
export class ReferenceLocation implements Location {
    constructor(init: OnlyData<ReferenceLocation>) {
        Object.assign(this, init)
    }

    file!: string
    position!: FilePosition
    memberPath?: string[]

    keyEquals(location: Location) {
        return this.file === location.file
        && this.position.toPrimitive() === location.position.toPrimitive()
    }

    toString() {
        return `${this.file}:${this.position}`
    }
}

type DeclarationPath = string[] | null | undefined

/** The address of a code snippet for a declaration with a definite member path and member name. */
export class DeclarationLocation implements Location {
    constructor(init: OnlyData<DeclarationLocation>) {
        Object.assign(this, init)
    }

    file!: string
    position!: FilePosition
    /**
     * - `undefined`: is default import
     * - `null`: imports root
     */
    memberPath!: DeclarationPath
    memberName!: string

    /**
     * The ES6 syntax for a default import is:
     *
     *     import foo from 'bar'
     */
    isDefaultImport() {
        return this.memberPath === undefined
    }

    /**
     * The ES6 syntax for a namespace import is:
     *
     *     import * as foo from 'bar'
     */
    isNamespaceImport() {
        return this.memberPath === null
    }

    /** Convert this instance into a human-readable string. */
    toString() {
        return `${this.file}:${this.position}`
    }
}

export class DeclarationImport {
    constructor(init: OnlyData<DeclarationImport>) {
        Object.assign(this, init)
    }

    memberPath!: DeclarationPath
    /**
     * - `undefined`: is default import
     * - `null`: imports root
     */
    memberName!: string | null | undefined
}

export const ALL_REFERENCE_KINDS = [
    /** Member calls */
    'usage',
    /** `import` declarations and `require()` statements */
    'import',
    /** Any kind of expression that is related to the package or a part of it. Very broad. Experimental. */
    'occurence'
] as const
export type ReferenceKind = (typeof ALL_REFERENCE_KINDS)[number]

/** A reference to a {@link Package} member in a downstream {@link Dependency}. */
export class Reference {
    constructor(init: OnlyData<Reference>) {
        Object.assign(this, init)
    }

    dependency!: Dependency
    location!: ReferenceLocation
    declaration!: DeclarationLocation | DeclarationImport
    alias!: string | undefined
    kind!: ReferenceKind

    matchString?: string

    declarationLocation() {
        assert(this.declaration instanceof DeclarationLocation)
        return this.declaration
    }

    toString() {
        return `${this.location} (\`${this.matchString}\`)`
    }
}

/** The abstract baseclass for all reference searchers. */
export abstract class ReferenceSearcher {
    constructor(
        public $package: Package,
        public dependency: Dependency,
        public includeKinds: readonly ReferenceKind[] | '*' = ['usage']
    ) { }

    async initialize() {
        // Stub method for subclasses.
    }

    /** Stream all references found in the directory. */
    async* searchReferences(rootDirectory: string) {
        const allReferences = this.basicSearchReferences(rootDirectory)
        if (this.includeKinds == '*') {
            return allReferences
        }

        for await (const reference of allReferences) {
            if (this.includeKinds.includes(reference.kind)) {
                yield reference
            }
        }
    }

    /** Internal streaming function to be implemented by subclasses. May spawn duplicate results. Must not honor `this.usageKinds`. */
    protected abstract basicSearchReferences(rootDirectory: string): AsyncGenerator<Reference, void, undefined>

    protected async findAllSourceFiles(rootDirectory: string) {
        // Exclude bundled and minified files
        return await glob('**{/!(dist)/,}!(*.min|dist).{js,ts}', {
            cwd: rootDirectory,
            nodir: true
        })
    }
}
