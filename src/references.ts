import { Dirent, promises as fsPromises } from "fs"
import escapeRegexp from './utils/escape-string-regexp' // WORKAROUND! Importing escape-string-regexp leads to ERR_REQUIRE_ESM
import fs from 'fs'
import glob from 'glob-promise'
import asyncIteratorToArray from 'it-all'
import _ from "lodash"
import tqdm from 'ntqdm'
import parseImports from 'parse-imports'
import path from 'path'

import { getCacheDirectory } from './npm-deps'
import rex from './utils/rex'


export type Reference = {
    dependentName: string
    file: string
    lineNumber: number
    /**
     * - `undefined`: is default import
     * - `null`: imports root
     *
     * @todo Primitive obsession! Model ExportMember class hierarchy.
     */
    memberName: string | null | undefined
    alias: string

    matchString?: string
}

type ModuleBinding = {
    moduleName: string
    /**
     * - `undefined`: is default import
     * - `null`: imports root
     *
     * @todo Primitive obsession! Model ExportMember class hierarchy.
     */
    memberName: string | null | undefined
    alias: string
}

export class ReferenceSearcher {
    packageName: string
    rootDirectory: string
    private static readonly maximumReportableDepth = 2

    constructor(packageName: string, rootDirectory?: string) {
        this.packageName = packageName
        this.rootDirectory = rootDirectory ?? getCacheDirectory()
    }

    async* searchReferences(limit?: number): AsyncIterable<Reference> {
        yield* this.basicSearchReferences(this.rootDirectory, limit, 0)
    }

    protected async* basicSearchReferences(rootDirectory: string, limit: number | undefined, depth: number): AsyncIterable<Reference> {
        if (!fs.existsSync(path.join(rootDirectory, 'package.json'))) {
            // Search recursively
            let depDirectories: Iterable<Dirent> = (
                await fsPromises.readdir(rootDirectory, { withFileTypes: true })
            ).filter(dirent => dirent.isDirectory)

            // TODO: Restructure recursive loop in favor of constant reportable depth
            if (!(depth > ReferenceSearcher.maximumReportableDepth)) {
                depDirectories = tqdm(depDirectories, { desc: `Scanning dependents (${rootDirectory})...` })
            }

            let i = 0
            for await (const depDirectory of depDirectories) {
                for await (const reference of this.basicSearchReferences(path.join(rootDirectory, depDirectory.name), undefined, depth + 1)) {
                    yield reference
                    if (limit && ++i >= limit) {
                        return
                    }
                }
            }
            return
        }

        const dependencyName = path.basename(rootDirectory)
        const packageSearcher = new PackageReferenceSearcher(this.packageName, dependencyName)
        let files: Iterable<string> = await glob('**{/!(dist)/,}!(*.min|dist).{js,ts}', { cwd: rootDirectory, nodir: true })
        if (!(depth > ReferenceSearcher.maximumReportableDepth)) {
            files = tqdm(files, { desc: `Scanning dependents (${dependencyName})...` })
        }
        for (const file of files) {
            yield* packageSearcher.searchReferencesInFile(rootDirectory, file)
        }
    }
}

class PackageReferenceSearcher {
    /** TODOS for later:
     * Honor package-specific module configurations such as webpack that can rename modules
     * Use type-checker. See also: babel; flow; hegel; TAJS; TypeScript; TypL
     */
    packageName: string
    dependencyName: string
    static readonly maximumFileSize = 100_000  // 100 MB
    protected commonJsPatterns!: ReadonlyArray<RegExp>

    constructor(packageName: string, dependencyName: string) {
        this.packageName = packageName
        this.dependencyName = dependencyName

        this.initializeCommonJsPatterns()
    }

    private initializeCommonJsPatterns() {
        // Let's build a regex family!
        // `foo = require('bar')`
        // `foo = require('bar/baz')`
        // See collectRequireBindings().

        const identifierPattern = /[\p{L}\p{Nl}$_][\p{L}\p{Nl}$\p{Mn}\p{Mc}\p{Nd}\p{Pc}]*/u

        const requirePattern = rex`
            (?<alias> ${identifierPattern} ) \s*
            = \s*
            require \s* \( \s*
                (?<quote>['"])
                (?<packageName> ${escapeRegexp(this.packageName)} )
                (
                    \/ (?<memberName> ${identifierPattern} )
                )?
                \k<quote>
            \s* \)
        /gm`

        this.commonJsPatterns = [requirePattern]
    }

    async* searchReferencesInFile(rootDirectory: string, filePath: string) {
        const fullPath = path.join(rootDirectory, filePath)
        const fileSize = (await fsPromises.stat(fullPath)).size
        if (fileSize > PackageReferenceSearcher.maximumFileSize) {
            console.warn(`Skipping very large file '${fullPath}'`)
            return
        }

        const source = fs.readFileSync(fullPath).toString()

        const importBindings = await asyncIteratorToArray(this.collectModuleBindings(source))
        if (!importBindings.length) {
            return
        }

        yield* this.collectReferences(source, importBindings, filePath)
    }

    async* collectReferences(source: string, bindings: Iterable<ModuleBinding>, filePath: string): AsyncGenerator<Reference, void, undefined> {
        const lines = source.split('\n')
        for (const [lineNo, line] of lines.entries()) {
            for (const binding of bindings) {
                if (!line.includes(binding.alias)) continue
                yield {
                    dependentName: this.dependencyName,
                    file: filePath,
                    lineNumber: lineNo + 1,
                    memberName: binding.memberName,
                    alias: binding.alias,
                    matchString: line
                }
            }
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
        //

        const imports = await (async () => {
            try {
                return await parseImports(source)
            } catch (parseError) {
                console.warn("Error from parse-imports", { parseError, source: source.slice(0, 100) })
                // This includes syntax errors but also TypeScript syntax which is not (yet?) supported by parse-imports.
                // See: https://github.com/TomerAberbach/parse-imports/issues/1
                // TODO: Increase robustness by stripping of everything below import statements
                return []
            }
        })()

        for (const _import of imports) {
            if (!(['builtin', 'package'].includes(_import.moduleSpecifier.type))) {
                continue
            }
            if (!_import.moduleSpecifier.isConstant) {
                continue
            }
            const packageName = _import.moduleSpecifier.value
            if (!packageName || packageName != this.packageName) {
                continue
            }

            if (_import.importClause) {
                // `import * as foo from 'bar'`
                if (_import.importClause.namespace) {
                    yield {
                        moduleName: packageName,
                        memberName: null,
                        alias: _import.importClause.namespace
                    }
                }
                // `import foo from 'bar'`
                if (_import.importClause.default) {
                    yield {
                        moduleName: packageName,
                        memberName: undefined,
                        alias: _import.importClause.default
                    }
                }
                // `import {foo1, foo2 as otherFoo} from 'bar'`
                for (const namedImport of _import.importClause.named) {
                    yield {
                        moduleName: packageName,
                        memberName: namedImport.specifier,
                        alias: namedImport.binding
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
            .map(match => match.groups!)
            .map(matchGroups => ({
                moduleName: matchGroups.packageName,
                memberName: matchGroups.memberName
                    /** `require()` without member name is ambiguous:
                      * | Exporting package type | `require()` return value |
                      * | ---------------------- | ------------------------ |
                      * | CommonJS               | default export           |
                      * | ECMA Script (ESM)      | `Module` instance        |
                      * Here we assume the more common CommonJS case and thus fall back to undefined.
                      *
                      * TODO: Create parameter to indicate the module type for packageName. */
                    ?? undefined,
                alias: matchGroups.alias
            }))
            .value()
    }
}
