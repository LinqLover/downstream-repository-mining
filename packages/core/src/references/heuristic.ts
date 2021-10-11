import fs from 'fs'
import { promises as fsPromises } from 'fs'
import itAll from 'it-all'
import LinesAndColumns from 'lines-and-columns'
import _ from 'lodash'
import type { Import, Options } from 'parse-imports'
import path from 'path'
import pkgDir from 'pkg-dir'

import { DeclarationImport, FilePosition, ReferenceSearcher, Reference, ReferenceLocation } from './base'
import rex from '../utils/rex'


type ModuleBinding = {
    moduleName: string
    /**
     * - `undefined`: is default import
     * - `null`: imports root
     */
    memberName: string | null | undefined
    alias: string
    index: number
}

/** A reference searcher that performs simple string searches for the names of imported modules. Just a baseline. */
export class HeuristicReferenceSearcher extends ReferenceSearcher {
    static readonly maximumFileSize = 100_000  // 100 MB
    protected commonJsPatterns!: readonly RegExp[]

    async initialize() {
        await super.initialize()
        await this.initializeCommonJsPatterns()
    }

    private async initializeCommonJsPatterns() {
        // Let's build a regex family!
        // `foo = require('bar')`
        // `foo = require('bar/baz')`
        // See collectRequireBindings().

        const identifierPattern = /[\p{L}\p{Nl}$_][\p{L}\p{Nl}$\p{Mn}\p{Mc}\p{Nd}\p{Pc}]*/u

        /**
         * Workaround for https://github.com/microsoft/TypeScript/issues/43329.
         *
         * TypeScript will always try to replace dynamic imports with `requires` which doesn't work for importing ESM from CJS.
         * We work around by "hiding" our dynamic import in a Function constructor (terrible...).
         *
         * In particular, we must not extract this call into a separate module.
         * This would result in sporadic unresolved promises in the jest environment.
         * See #65.
         */
        const dynamicImport = new Function('moduleName', 'return import(moduleName)')
        const escapeRegexp: (regex: string) => string = (await dynamicImport('escape-string-regexp')).default

        const requirePattern = rex`
            (?<alias> ${identifierPattern} ) \s*
            = \s*
            require \s* \( \s*
                (?<quote>['"])
                (?<packageName> ${escapeRegexp(this.$package.name)} )
                (
                    \/ (?<memberName> ${identifierPattern} )
                )?
                \k<quote>
            \s* \)
        /gm`

        this.commonJsPatterns = [requirePattern]
    }

    async* basicSearchReferences() {
        for (const file of await this.findAllSourceFiles(this.dependency.sourceDirectory)) {
            yield* this.searchReferencesInFile(this.dependency.sourceDirectory, file)
        }
    }

    async* searchReferencesInFile(rootDirectory: string, filePath: string) {
        const fullPath = path.join(rootDirectory, filePath)
        const fileSize = (await fsPromises.stat(fullPath)).size
        if (fileSize > HeuristicReferenceSearcher.maximumFileSize) {
            console.warn(`Skipping very large file`, { dependencyName: this.dependency.name, fullPath })
            return
        }

        const source = fs.readFileSync(fullPath).toString()

        const importBindings = await itAll(this.collectModuleBindings(source))
        if (!importBindings.length) {
            return
        }

        yield* this.collectReferences(source, importBindings, filePath)
    }

    async* collectReferences(source: string, bindings: Iterable<ModuleBinding>, filePath: string) {
        const lines = source.split('\n')
        const getPosition = (() => {
            const linesAndColumns = new LinesAndColumns(source)
            return (index: number) => {
                const location = linesAndColumns.locationForIndex(index)
                if (!location) {
                    console.warn("Position of match not found", { filePath, index })
                    return <FilePosition><unknown>undefined
                }
                return new FilePosition({
                    row: location.line + 1,
                    column: location.column + 1
                })
            }
        })()

        let minIndex = 0
        for (const line of lines) {
            for (const binding of bindings) {
                const index = source.indexOf(binding.alias, minIndex) // TODO: Room for optimization
                if (index == -1 || index - minIndex > line.length) { continue }

                const position = getPosition(index)
                const bindingPosition = getPosition(binding.index)

                const isImport = position?.row == bindingPosition?.row
                yield new Reference({
                    dependency: this.dependency,
                    location: new ReferenceLocation({
                        file: filePath,
                        memberPath: undefined,
                        position
                    }),
                    kind: isImport ? 'import' : 'usage',
                    declaration: new DeclarationImport({
                        memberPath: binding.memberName == null || binding.memberName == undefined
                            ? binding.memberName
                            : [binding.memberName],
                        memberName: binding.memberName
                    }),
                    alias: binding.alias,
                    matchString: line
                })
            }
            minIndex += line.length + 1
        }
    }

    async* collectModuleBindings(source: string) {
        yield* this.collectEsmBindings(source)
        yield* this.collectCommonJsBindings(source)
    }

    /**
     * Collect ESM (ECMAScript module) module bindings that use the `import` keyword.
     * See {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import}.
     */
    async* collectEsmBindings(source: string): AsyncGenerator<ModuleBinding, void, undefined> {
        const imports = await (async () => {
            try {
                // Truly awful hack! There are a few things going on here:
                // - Jest (or something) can't find parse-imports by just importing its package name
                //   no matter what. Just give it the path to the src/index.js file
                //
                // - Workaround for https://github.com/microsoft/TypeScript/issues/43329.
                //
                //   TypeScript will always try to replace dynamic imports with `requires` which doesn't work for importing ESM from CJS.
                //   We work around by "hiding" our dynamic import in a Function constructor (terrible...).
                //
                //   In particular, we must not extract this call into a separate module.
                //   This would result in sporadic unresolved promises in the jest environment.
                //   See #65.
                //
                // - All of this required jest@next, ts-jest@next, AND `NODE_OPTIONS=--experimental-vm-modules`
                const parseImportsIndexPath = `${await pkgDir()}/node_modules/parse-imports/src/index.js`
                const dynamicImport = new Function('moduleName', 'return import(moduleName)')
                let parseImports: (
                    code: string,
                    options?: Options
                ) => Promise<Iterable<Import>>

                try {
                    parseImports = (await dynamicImport(parseImportsIndexPath)).default
                } catch (parseError) {
                    if (!(parseError instanceof Error && 'code' in parseError && (<{ code: string }>parseError).code == 'ERR_MODULE_NOT_FOUND')) {
                        throw parseError
                    }
                    // This will occur if this package is imported as a local dependency from another package via a symlink.
                    // For now, let's handle this by assuming the depending package is a sibling of ourselves ...
                    // Hardcoded! So many hacks! 😭
                    const parseImportsIndexPath = `${await pkgDir()}/../core/node_modules/parse-imports/src/index.js`
                    const dynamicImport = new Function('moduleName', 'return import(moduleName)')
                    parseImports = (await dynamicImport(parseImportsIndexPath)).default
                }

                return await parseImports(source)
            } catch (parseError) {
                console.warn("Error from parse-imports", { parseError, source: source.slice(0, 100), dependencyName: this.dependency.name }) // TODO: Make getter denedencyName?
                // This includes syntax errors but also TypeScript syntax which is not (yet?) supported by parse-imports.
                // See: https://github.com/TomerAberbach/parse-imports/issues/1
                return []
            }
        })()

        for (const $import of imports) {
            if (!(['builtin', 'package'].includes($import.moduleSpecifier.type))) {
                continue
            }
            if (!$import.moduleSpecifier.isConstant) {
                continue
            }
            const packageName = $import.moduleSpecifier.value
            if (!packageName || packageName != this.$package.name) {
                continue
            }

            if ($import.importClause) {
                // `import * as foo from 'bar'`
                if ($import.importClause.namespace) {
                    yield {
                        moduleName: packageName,
                        memberName: null,
                        alias: $import.importClause.namespace,
                        index: $import.startIndex
                    }
                }
                // `import foo from 'bar'`
                if ($import.importClause.default) {
                    yield {
                        moduleName: packageName,
                        memberName: undefined,
                        alias: $import.importClause.default,
                        index: $import.startIndex
                    }
                }
                // `import {foo1, foo2 as otherFoo} from 'bar'`
                for (const namedImport of $import.importClause.named) {
                    yield {
                        moduleName: packageName,
                        memberName: namedImport.specifier,
                        alias: namedImport.binding,
                        index: $import.startIndex
                    }
                }
            }
        }
    }

    /**
     * Collect CommonJS module bindings that use the built-in `require()` function.
     * See {@link https://nodejs.org/api/modules.html#modules_require_id}.
     */
    async* collectCommonJsBindings(source: string): AsyncGenerator<ModuleBinding, void, undefined> {
        yield* _.chain(this.commonJsPatterns)
            .flatMap(pattern => [...source.matchAll(pattern) ?? []])
            .map(match => {
                if (!match.index) {
                    throw new Error("match index not found")
                }
                if (!match.groups) {
                    throw new Error("match groups not found")
                }

                return {
                    moduleName: match.groups.packageName,
                    memberName: match.groups.memberName
                        /** `require()` without member name is ambiguous:
                         * | Exporting package type | `require()` return value |
                         * | ---------------------- | ------------------------ |
                         * | CommonJS               | default export           |
                         * | ECMA Script (ESM)      | `Module` instance        |
                         * Here we assume the more common CommonJS case and thus fall back to undefined. */
                        ?? undefined,
                    alias: match.groups.alias,
                    index: match.index
                }
            })
            .value()
    }
}
