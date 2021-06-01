import { Dirent, promises as fsPromises } from 'fs'
import escapeRegexp from './utils/escape-string-regexp' // WORKAROUND! Importing escape-string-regexp leads to ERR_REQUIRE_ESM
import fs from 'fs'
import glob from 'glob-promise'
import asyncIteratorToArray from 'it-all'
import _ from "lodash"
import tqdm from 'ntqdm'
import parseImports from 'parse-imports'
import path from 'path'
import pathIsInside from 'path-is-inside'
import tryCatch from 'try-catch'
import ts from 'typescript'

import { getCacheDirectory } from './npm-deps'
import rex from './utils/rex'
import Package from './package'


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
    isImport: boolean

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
    package: Package
    rootDirectory: string
    packageReferenceSearcher: ConcretePackageReferenceSearcher = HeuristicPackageReferenceSearcher
    private static readonly maximumReportableDepth = 2

    constructor(_package: Package, rootDirectory?: string, packageReferenceSearcher?: string) {
        this.package = _package
        this.rootDirectory = rootDirectory ?? getCacheDirectory()
        if (packageReferenceSearcher) {
            this.packageReferenceSearcher = PackageReferenceSearcher.named(packageReferenceSearcher)
        }
    }

    async* searchReferences(includeImports = false, limit?: number): AsyncIterable<Reference> {
        yield* this.basicSearchReferences(this.rootDirectory, includeImports, limit, 0)
    }

    protected async* basicSearchReferences(rootDirectory: string, includeImports: boolean, limit: number | undefined, depth: number): AsyncIterable<Reference> {
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
                for await (const reference of this.basicSearchReferences(path.join(rootDirectory, depDirectory.name), includeImports, undefined, depth + 1)) {
                    if (!includeImports && reference.isImport) {
                        continue
                    }
                    yield reference
                    if (limit && ++i > limit) {
                        return
                    }
                }
            }
            return
        }

        const dependencyName = path.basename(rootDirectory)
        const packageSearcher = new this.packageReferenceSearcher(this.package, dependencyName)
        yield* packageSearcher.searchReferences(rootDirectory)
    }
}

type ConcretePackageReferenceSearcher = (new (_package: Package, rootDirectory: string) => PackageReferenceSearcher)

abstract class PackageReferenceSearcher {
    /** TODOS for later:
     * Honor package-specific module configurations such as webpack that can rename modules
     * What about babel transformations? 😱
     */
    package: Package
    dependencyName: string

    static named(name: string): ConcretePackageReferenceSearcher {
        switch (name) {
            case 'heuristic':
                return HeuristicPackageReferenceSearcher
            case 'types':
                return TypePackageReferenceSearcher
            default:
                throw new Error("Unrecognized PackageReferenceSearcher name")
        }
    }

    constructor(_package: Package, dependencyName: string) {
        this.package = _package
        this.dependencyName = dependencyName
    }

    abstract searchReferences(rootDirectory: string): AsyncGenerator<Reference, void, undefined>
}

class HeuristicPackageReferenceSearcher extends PackageReferenceSearcher {
    static readonly importKeywords = ['import', 'require']
    static readonly maximumFileSize = 100_000  // 100 MB
    protected commonJsPatterns!: ReadonlyArray<RegExp>

    constructor(_package: Package, dependencyName: string) {
        super(_package, dependencyName)

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
                (?<packageName> ${escapeRegexp(this.package.name)} )
                (
                    \/ (?<memberName> ${identifierPattern} )
                )?
                \k<quote>
            \s* \)
        /gm`

        this.commonJsPatterns = [requirePattern]
    }

    async* searchReferences(rootDirectory: string) {
        const files = await glob('**{/!(dist)/,}!(*.min|dist).{js,ts}', { cwd: rootDirectory, nodir: true })
        for (const file of files) {
            yield* this.searchReferencesInFile(rootDirectory, file)
        }
    }

    async* searchReferencesInFile(rootDirectory: string, filePath: string) {
        const fullPath = path.join(rootDirectory, filePath)
        const fileSize = (await fsPromises.stat(fullPath)).size
        if (fileSize > HeuristicPackageReferenceSearcher.maximumFileSize) {
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
                    isImport: HeuristicPackageReferenceSearcher.importKeywords.some(keyword => line.includes(keyword)),  // as brittle as the rest of this implementation
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
            if (!packageName || packageName != this.package.name) {
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

class TypePackageReferenceSearcher extends PackageReferenceSearcher {
    protected typeChecker!: ts.TypeChecker
    protected references!: Set<Reference>
    protected dependencyDirectory!: string // TODO: Initialize in constructor?
    private static identifierPattern = /[\p{L}\p{Nl}$_][\p{L}\p{Nl}$\p{Mn}\p{Mc}\p{Nd}\p{Pc}]*/u

    async* searchReferences(rootDirectory: string) {
        this.dependencyDirectory = rootDirectory
        const options = this.parseOptions(this.dependencyDirectory, {
            allowJs: true,
            checkJs: true
        })
        // Since the dependency is not installed, we need to do some hacks here ...
        Object.assign(options.options, {
            paths: {
                ...options.options.paths,
                // Map our package of interest to known location
                [this.package.name]: [
                    ...((options.options.paths ?? {})[this.package.name] ?? []),
                    path.resolve(this.package.directory!)
                ],
                [`${this.package.name}/*`]: [
                    ...((options.options.paths ?? {})[`${this.package.name}/*`] ?? []),
                    `${path.resolve(this.package.directory!)}/*`
                ]
            },
            // Prevent the compiler from searching all parent folders for type definitions - these are not relevant
            typeRoots: options.options.typeRoots ?? [path.resolve(this.dependencyDirectory, './node_modules/@types')]
        })
        if (!options.fileNames.length) {
            console.warn("Heuristic file search")
            options.fileNames = (await glob('**{/!(dist)/,}!(*.min|dist).{js,ts}', { cwd: this.dependencyDirectory, nodir: true })).map(file => path.join(this.dependencyDirectory, file))
        }
        // 4l8r: Download all required type defs (or at much as possible) for better type inference.
        const program = ts.createProgram(options.fileNames, options.options)
        this.typeChecker = program.getTypeChecker()

        this.references = new Set<Reference>()

        for (const sourceFile of program.getSourceFiles()) {
            if (!options.fileNames.includes(sourceFile.fileName)) {
                continue
            }
            // TODO: Skip if sourceFile.isDeclarationFile?
            ts.forEachChild(sourceFile, (node) => this.visitNode(node))
        }
        yield* this.references
    }

    parseOptions(rootDirectory: string, existingOptions?: ts.CompilerOptions) {
        const configFileName = ts.findConfigFile(rootDirectory, ts.sys.fileExists)
        let config: any
        if (configFileName && pathIsInside(configFileName, rootDirectory)) {
            const configFile = ts.readConfigFile(configFileName, ts.sys.readFile)
            config = configFile.config
        }
        return ts.parseJsonConfigFileContent(config ?? {}, ts.sys, rootDirectory, existingOptions)
    }

    visitNode(node: ts.Node) {
        const reference = this.findReference(node)
        if (reference) {
            this.references.add(reference)
        }
        ts.forEachChild(node, (node) => this.visitNode(node))
    }

    findReference(node: ts.Node) {
        if (ts.isPropertyAccessExpression(node)) {
            const propertyReference = this.findPropertyReference(node)
            if (propertyReference) {
                return propertyReference
            }
        }

        const [, type] = tryCatch(this.typeChecker.getTypeAtLocation, node)
        const symbol = type?.symbol ?? type?.aliasSymbol
        if (!symbol || !symbol.declarations) {
            return
        }
        const declaration = symbol.declarations.find(declaration => pathIsInside(
            path.resolve(declaration.getSourceFile().fileName),
            path.resolve(this.package.directory!)))
        if (!declaration) {
            return
        }
        const file = node.getSourceFile()
        const { line } = file.getLineAndCharacterOfPosition(node.getStart())
        return <Reference>{
            dependentName: this.dependencyName,
            file: path.relative(this.dependencyDirectory!, file.fileName),
            lineNumber: line + 1,
            memberName: this.getFullQualifiedName(declaration),
            isImport: this.isImport(node),
            alias: node.getText(file)
        }
    }

    private isImport(node: ts.Node, depth = 0): boolean {
        // require statement
        // Type check has already been passed in the caller
        if (ts.isVariableDeclaration(node) && (node.initializer as ts.CallExpression)?.expression?.getText() === 'require') {
            return true
        }
        if (ts.isCallExpression(node) && node.expression.getText() === 'require') {
            return true
        }

        // import statement
        if (ts.isImportDeclaration(node) || ts.isImportSpecifier(node) || ts.isImportClause(node)) {
            return true
        }

        if (depth < 2) {
            return this.isImport(node.parent, depth + 1)
        }
        return false
    }

    findPropertyReference(node: ts.PropertyAccessExpression) {
        const [, type] = tryCatch(this.typeChecker.getTypeAtLocation, node.expression)
        const symbol = type?.symbol
        if (!symbol || !symbol.declarations) {
            return
        }
        const declaration = symbol.declarations.find(declaration => pathIsInside(
            path.resolve(declaration.getSourceFile().fileName), path.resolve(this.package.directory!)))
        if (!declaration) {
            return
        }
        if (symbol.flags & ts.SymbolFlags.Module) {
            return
        }
        const file = node.getSourceFile()
        const { line, character } = file.getLineAndCharacterOfPosition(node.getStart())
        return <Reference>{
            dependentName: this.dependencyName,
            file: path.relative(this.dependencyDirectory!, file.fileName),
            lineNumber: line + 1,
            memberName: `${this.getFullQualifiedName(declaration)}.${node.name.text}`,
            matchString: node.getText(file),
            isImport: false,
            alias: node.getText(file)
        }
    }

    // TODO: Align format with heuristic approach later? On the other hand, maybe we will not need it anyway.
    getFullQualifiedName(declaration: ts.Declaration) {
        const symbol = (<Partial<{ symbol: ts.Symbol }>>declaration).symbol!
        const name = this.isDefaultExport(symbol, declaration) || symbol.flags & ts.SymbolFlags.Module ? this.getRelativeQualifiedName(symbol) : symbol.name
        const relativePath = path.relative(this.package.directory!, declaration.getSourceFile().fileName)
        const shortRelativePath = relativePath.replace(/\.([^.]+|d\.ts)$/, '')
        return name ? `${shortRelativePath}/${name}` : shortRelativePath
    }

    isDefaultExport(symbol: ts.Symbol, declaration: ts.Declaration) {
        const sourceFile = declaration.getSourceFile() as unknown as { symbol: ts.Symbol }
        if (!sourceFile) return false
        const exports = sourceFile.symbol?.exports
        if (!exports) return false
        const defaultExport = exports?.get(<ts.__String>'export=')
        if (!(defaultExport && defaultExport.declarations)) return false
        return defaultExport.declarations.some(_export => (_export as unknown as {expression: ts.Expression})?.expression?.getText() == symbol.name)
    }

    getRelativeQualifiedName(symbol: ts.Symbol): string | null | undefined {
        const parent = (<Partial<{parent?: ts.Symbol}>>symbol).parent
        if (!parent) {
            if (!ts.isSourceFile(symbol.valueDeclaration!)) {
                return undefined
            }
            return null
        }
        const symbolName = this.typeChecker.symbolToString(symbol)
        const parentName = this.getRelativeQualifiedName(parent)
        if (!parentName) {
            return symbolName
        }
        const parentShortName = parentName.replace(/\.(js|ts|d\.ts)$/, '')
        return `${parentShortName}.${symbolName}`
    }
}
