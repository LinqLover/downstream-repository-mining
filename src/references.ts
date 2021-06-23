import { Dirent, promises as fsPromises } from 'fs'
import fs from 'fs'
import glob from 'glob-promise'
import asyncIteratorToArray from 'it-all'
import _ from "lodash"
import tqdm from 'ntqdm'
import path from 'path'
import pathIsInside from 'path-is-inside'
import tryCatch from 'try-catch'
import ts from 'typescript'

import { getCacheDirectory } from './npm-deps'
import Package from './package'
import rex from './utils/rex'


export class FilePosition {
    constructor(init: FilePosition) {
        Object.assign(this, init)
    }

    row!: number
    column?: number

    toString() {
        return this.column ? `${this.row}:${this.column}` : `${this.row}`
    }
}

const ALL_REFERENCE_TYPES = [
    /** Member calls */
    'usage',
    /** Import and require statements */
    'import',
    /** Any kind of expression that is related to the package or a part of it. Very broad. Experimental. */
    'occurence'
] as const
export type ReferenceType = (typeof ALL_REFERENCE_TYPES)[number]

export class Reference {
    constructor(init: Reference) {
        Object.assign(this, init)
    }

    dependentName!: string
    file!: string
    position!: FilePosition
    /**
     * - `undefined`: is default import
     * - `null`: imports root
     *
     * @todo Primitive obsession! Model ExportMember class hierarchy.
     */
    memberName: string | null | undefined
    alias!: string | undefined
    type!: ReferenceType

    matchString?: string

    toString() {
        return `${this.file}:${this.position}`
    }
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

    async* searchReferences(limit?: number, includeTypes: ReadonlyArray<ReferenceType> | '*' = ['usage']): AsyncIterable<Reference> {
        yield* this.basicSearchReferences(this.rootDirectory, limit, includeTypes == '*' ? ALL_REFERENCE_TYPES : includeTypes, 0)
    }

    protected async* basicSearchReferences(rootDirectory: string, limit: number | undefined, includeTypes: ReadonlyArray<ReferenceType>, depth: number): AsyncIterable<Reference> {
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
                for await (const reference of this.basicSearchReferences(path.join(rootDirectory, depDirectory.name), undefined, includeTypes, depth + 1)) {
                    if (!includeTypes.includes(reference.type)) {
                        continue
                    }
                    yield reference
                    if (limit && ++i >= limit) {
                        return
                    }
                }
            }
            return
        }

        const dependencyName = path.basename(rootDirectory)
        const packageSearcher = new this.packageReferenceSearcher(this.package, dependencyName)
        await packageSearcher.initialize()
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

    async initialize() {
        // Stub method for subclasses.
    }

    abstract searchReferences(rootDirectory: string): AsyncGenerator<Reference, void, undefined>

    protected async findAllSourceFiles(rootDirectory: string) {
        // Exclude bundled and minified files
        return await glob('**{/!(dist)/,}!(*.min|dist).{js,ts}', {
            cwd: rootDirectory,
            nodir: true
        })
    }
}

class HeuristicPackageReferenceSearcher extends PackageReferenceSearcher {
    static readonly importKeywords = ['import', 'require']
    static readonly maximumFileSize = 100_000  // 100 MB
    protected commonJsPatterns!: ReadonlyArray<RegExp>

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
         * Workaround for https://github.com/microsoft/TypeScript/issues/43329. // TODO: Check if this is a regression
         *
         * TypeScript will always try to replace dynamic imports with `requires` which doesn't work for importing ESM from CJS.
         * We work around by "hiding" our dynamic import in a Function constructor (terrible...).
         *
         * In particular, we must not extract this call into a separate module.
         * This would result in sporadic unresolved promises in the jest environment.
         * See #65.
         */
        const dynamicImport = new Function('moduleName', 'return import(moduleName)')
        const escapeRegexp = (await dynamicImport('escape-string-regexp')).default
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
        for (const file of await this.findAllSourceFiles(rootDirectory)) {
            yield* this.searchReferencesInFile(rootDirectory, file)
        }
    }

    async* searchReferencesInFile(rootDirectory: string, filePath: string) {
        const fullPath = path.join(rootDirectory, filePath)
        const fileSize = (await fsPromises.stat(fullPath)).size
        if (fileSize > HeuristicPackageReferenceSearcher.maximumFileSize) {
            console.warn(`Skipping very large file`, { dependencyName: this.dependencyName, fullPath })
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
                const isImport = HeuristicPackageReferenceSearcher.importKeywords.some(keyword => line.includes(keyword))  // as brittle as the rest of this implementation
                yield {
                    dependentName: this.dependencyName,
                    file: filePath,
                    position: { row: lineNo + 1 },
                    type: isImport ? 'import' : 'usage',
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
                const parseImportsIndexPath = path.join(path.dirname(__dirname), 'node_modules/parse-imports/src/index.js')
                const dynamicImport = new Function('moduleName', 'return import(moduleName)')
                const parseImports = (await dynamicImport(parseImportsIndexPath)).default

                return await parseImports(source)
            } catch (parseError) {
                console.warn("Error from parse-imports", { parseError, source: source.slice(0, 100), dependencyName: this.dependencyName })
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
            .map(match => {
                if (!match.groups) {
                    throw new Error("match groups not found")
                }
                return match.groups
            })
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
    protected references!: Reference[]
    protected dependencyDirectory!: string

    async* searchReferences(rootDirectory: string) {
        this.dependencyDirectory = rootDirectory
        try {
            const options = this.loadOptions()

            const allFileNames = (
                await this.findAllSourceFiles(this.dependencyDirectory)
            ).map(file => path.join(this.dependencyDirectory, file))
            if (!options.fileNames.length) {
                console.warn("No file names passed, searching whole repository", { dependencyName: this.dependencyName })
                options.fileNames = allFileNames
            }

            const host = this.createCompilerHost(options.options)
            const program = ts.createProgram(options.fileNames, options.options, host)
            this.typeChecker = program.getTypeChecker()

            for (const sourceFile of program.getSourceFiles()) {
                if (!options.fileNames.includes(sourceFile.fileName)) {
                    // External library, maybe our own package
                    continue
                }
                if (!allFileNames.includes(sourceFile.fileName)) {
                    // Irrelevant file such as bundle
                    continue
                }

                this.references = []  // A generator would be nicer but also more complicated
                ts.forEachChild(sourceFile, (node) => this.visitNode(node))
                yield* this.references
            }
        } finally {
            this.dependencyDirectory = ""
        }
    }

    loadOptions() {
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
                    path.resolve(this.package.directory)
                ],
                // Same for submodules of our package
                [`${this.package.name}/*`]: [
                    ...((options.options.paths ?? {})[`${this.package.name}/*`] ?? []),
                    `${path.resolve(this.package.directory)}/*`
                ]
            },
            // Prevent the compiler from searching all parent folders for type definitions - these are not relevant
            typeRoots: options.options.typeRoots ?? [path.resolve(this.dependencyDirectory, './node_modules/@types')]
        })

        // 4l8r: Download all required type defs (or at much as possible) for better type inference.

        return options
    }

    parseOptions(rootDirectory: string, overrideOptions?: ts.CompilerOptions) {
        const configFileName = ts.findConfigFile(rootDirectory, ts.sys.fileExists)
        let config: ts.CompilerOptions
        if (configFileName && pathIsInside(configFileName, rootDirectory)) {
            const configFile = ts.readConfigFile(configFileName, ts.sys.readFile)
            config = configFile.config
        }
        config ??= {}
        return ts.parseJsonConfigFileContent(config, ts.sys, rootDirectory, overrideOptions)
    }

    protected createCompilerHost(options: ts.CompilerOptions) {
        const host = ts.createCompilerHost(options)

        host.getCurrentDirectory = () => this.dependencyDirectory

        // Customize module resolution
        const basicDirectoryExists = host.directoryExists ?? ts.sys.directoryExists
        host.directoryExists = directoryName => {
            if (directoryName == path.resolve(this.dependencyDirectory, 'node_modules')) {
                // Pretend this dependent to be installed
                return true
            }
            if (path.basename(directoryName) == 'node_modules' && !pathIsInside(path.resolve(directoryName), path.resolve(this.dependencyDirectory))) {
                // Stop module resolution outside dependent folder - this might cause unintended side effects and will slow down search significantly
                return false
            }
            return basicDirectoryExists(directoryName)
        }

        return host
    }

    private visitNode(node: ts.Node) {
        const reference = this.findReference(node)
        if (reference) {
            this.references.push(reference)
        }
        ts.forEachChild(node, (node) => this.visitNode(node))
    }

    findReference(node: ts.Node) {
        return this.findImportReference(node)
            || this.findUsageReference(node)
            || this.findOccurrenceReference(node)
    }

    protected findImportReference(node: ts.Node) {
        // `require()` statement
        if (ts.isCallExpression(node) && node.expression.getText() == 'require') {
            let targetNode: ts.Node = node
            if (ts.isVariableDeclaration(targetNode.parent)) {
                targetNode = targetNode.parent
            }
            return this.createReference(node, 'import', undefined, file =>
                ts.isVariableDeclaration(targetNode) ? targetNode.name.getText(file) : undefined)
        }

        // `import` declaration
        if (ts.isImportSpecifier(node) || node.parent && ts.isImportClause(node.parent)) {
            return this.createReference(node, 'import')
        }
    }

    protected findUsageReference(node: ts.Node) {
        // Function calls, template function invocations, etc.
        if (ts.isCallLikeExpression(node)) {
            const [, type] = tryCatch(this.typeChecker.getTypeAtLocation, this.getCallLikeNode(node))
            const symbol = type?.symbol ?? type?.aliasSymbol
            return symbol?.declarations && this.createReference(node, 'usage', symbol)
        }

        // Property accesses (excluding accesses to called functions)
        if (ts.isPropertyAccessExpression(node) && !(
            ts.isCallLikeExpression(node.parent) && this.getCallLikeNode(node.parent) == node)
        ) {
            // TODO: Do we already support ElementAccess (x[y]) here?
            const symbol = this.typeChecker.getSymbolAtLocation(node)
            return symbol?.declarations && this.createReference(node, 'usage', symbol)
        }
    }

    protected findOccurrenceReference(node: ts.Node) {
        const targetNode = ts.isCallLikeExpression(node)
            ? ts.isTaggedTemplateExpression(node)
                ? node.tag
                : ts.isJsxOpeningLikeElement(node)
                    ? node
                    : node.expression
            : node
        const reference = this.createReference(targetNode, 'occurence')
        if (!reference) {
            return
        }
        reference.matchString = targetNode.parent.getText()
        return reference

    }

    protected createReference(node: ts.Node, type: ReferenceType, symbol?: ts.Symbol, aliasCallback?: (file: ts.SourceFile) => string | undefined) {
        const declaration = symbol ? this.findDeclarationForSymbol(symbol) : this.findDeclarationForNode(node)
        if (!declaration) {
            return
        }

        const file = node.getSourceFile()
        const { line, character } = file.getLineAndCharacterOfPosition(node.getStart())

        const matchString = node.getText(file)

        return new Reference({
            dependentName: this.dependencyName,
            file: path.relative(this.dependencyDirectory, file.fileName),
            position: { row: line + 1, column: character + 1 },
            memberName: this.getFullQualifiedName(declaration, type == 'import'),
            type: type,
            matchString: matchString,
            alias: aliasCallback ? aliasCallback(file) : matchString
        })
    }

    protected findDeclarationForNode(node: ts.Node) {
        const [, type] = tryCatch(this.typeChecker.getTypeAtLocation, node)
        const symbol = type?.symbol ?? type?.aliasSymbol
        if (!symbol?.declarations) {
            return
        }
        return this.findDeclarationForSymbol(symbol)
    }

    protected findDeclarationForSymbol(symbol: ts.Symbol) {
        return (symbol.declarations ?? []).find(declaration => pathIsInside(
            path.resolve(declaration.getSourceFile().fileName),
            path.resolve(this.package.directory))
        )
    }

    protected getCallLikeNode(node: ts.CallLikeExpression): ts.LeftHandSideExpression | ts.JsxOpeningElement {
        return ts.isTaggedTemplateExpression(node) ? node.tag : (ts.isJsxOpeningLikeElement(node) ? node : node.expression)
    }

    // TODO: Align format with heuristic approach later? On the other hand, maybe we will not need it anyway.
    protected getFullQualifiedName(declaration: ts.Declaration, isImport: boolean) {
        const symbol = (<Partial<{ symbol: ts.Symbol }>>declaration).symbol
        const name = symbol && (isImport
            ? this.isDefaultExport(symbol, declaration) || symbol.flags & ts.SymbolFlags.Module
                ? undefined
                : symbol.name
            : this.getRelativeQualifiedName(symbol))
        const relativePath = path.relative(this.package.directory, declaration.getSourceFile().fileName)
        const shortRelativePath = relativePath.replace(/\.([^.]+|d\.ts)$/, '')
        return name ? `${shortRelativePath}/${name}` : shortRelativePath
    }

    protected getRelativeQualifiedName(symbol: ts.Symbol): string | null | undefined {
        if (!symbol.valueDeclaration) {
            return null
        }
        let parent = (<Partial<{parent?: ts.Symbol}>>symbol).parent
        if (!parent) {
            if (ts.isSourceFile(symbol.valueDeclaration)) {
                return null
            }
            if (this.isDefaultExport(symbol, symbol.valueDeclaration)) {
                return undefined
            }
        }
        {
            let parentNode: ts.Node = symbol.valueDeclaration.parent
            while (!((parent = (<{ symbol: ts.Symbol }><unknown>parentNode).symbol) && parent.name != '__object')) {
                parentNode = parentNode.parent
            }
        }
        const symbolName = this.typeChecker.symbolToString(symbol)
        const parentName = this.getRelativeQualifiedName(parent)
        if (!parentName) {
            return symbolName
        }
        const parentShortName = parentName.replace(/\.(js|ts|d\.ts)$/, '')
        return `${parentShortName}.${symbolName}`
    }

    private isDefaultExport(symbol: ts.Symbol, declaration: ts.Declaration) {
        const sourceFile = declaration.getSourceFile() as unknown as { symbol: ts.Symbol }
        if (!sourceFile) { return false }

        const exports = sourceFile.symbol?.exports
        if (!exports) { return false }

        const defaultExport = exports?.get(<ts.__String>'export=')
        if (!(defaultExport && defaultExport.declarations)) { return false }

        return defaultExport.declarations.some(_export =>
            (_export as unknown as { expression: ts.Expression })?.expression?.getText() == symbol.name
        )
    }
}
