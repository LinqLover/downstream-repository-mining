import { strict as assert } from 'assert'
import { Dirent, promises as fsPromises } from 'fs'
import fs from 'fs'
import glob from 'glob-promise'
import asyncIteratorToArray from 'it-all'
import LinesAndColumns from 'lines-and-columns'
import _ from 'lodash'
import type { Import, Options } from 'parse-imports'
import path from 'path'
import pathIsInside from 'path-is-inside'
import pkgDir from 'pkg-dir'
import tryCatch from 'try-catch'
import ts from 'typescript'

import { Package } from './packages'
import { OnlyData } from './utils/OnlyData'
import rex from './utils/rex'
import { Dependency } from './dependencies'


export class FilePosition {
    constructor(init: OnlyData<FilePosition>) {
        Object.assign(this, init)
    }

    row!: number
    column?: number

    toString() {
        return this.column ? `${this.row}:${this.column}` : `${this.row}`
    }
}

const ALL_REFERENCE_KINDS = [
    /** Member calls */
    'usage',
    /** Import and require statements */
    'import',
    /** Any kind of expression that is related to the package or a part of it. Very broad. Experimental. */
    'occurence'
] as const
export type ReferenceKind = (typeof ALL_REFERENCE_KINDS)[number]

export class Reference {
    constructor(init: OnlyData<Reference>) {
        Object.assign(this, init)
    }

    dependency!: Dependency
    file!: string
    position!: FilePosition
    memberPath?: string[]
    /**
     * - `undefined`: is default import
     * - `null`: imports root
     *
     * @todo Primitive obsession! Model ExportMember class hierarchy.
     */
    declarationMemberName: string | null | undefined
    declarationFile?: string
    declarationMemberPath: string[] | null | undefined
    alias!: string | undefined
    kind!: ReferenceKind

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
    index: number
}

export class ReferenceSearcher {
    package: Package
    rootDirectory: string
    packageReferenceSearcher: ConcretePackageReferenceSearcher = HeuristicPackageReferenceSearcher
    private static readonly maximumReportableDepth = 2

    constructor($package: Package, rootDirectory: string, packageReferenceSearcher?: string) {
        this.package = $package
        this.rootDirectory = rootDirectory
        if (packageReferenceSearcher) {
            this.packageReferenceSearcher = PackageReferenceSearcher.named(packageReferenceSearcher)
        }
    }

    async* searchReferences(limit?: number, includeKinds: ReadonlyArray<ReferenceKind> | '*' = ['usage']): AsyncIterable<Reference> {
        yield* this.basicSearchReferences(this.rootDirectory, limit, includeKinds == '*' ? ALL_REFERENCE_KINDS : includeKinds, 0)
    }

    protected async* basicSearchReferences(rootDirectory: string, limit: number | undefined, includeKinds: ReadonlyArray<ReferenceKind> | '*', depth: number): AsyncIterable<Reference> {
        if (!fs.existsSync(path.join(rootDirectory, 'package.json'))) {
            // Search recursively
            const depDirectories: Iterable<Dirent> = (
                await fsPromises.readdir(rootDirectory, { withFileTypes: true })
            ).filter(dirent => dirent.isDirectory)

            let i = 0
            for await (const depDirectory of depDirectories) {
                for await (const reference of this.basicSearchReferences(path.join(rootDirectory, depDirectory.name), undefined, includeKinds, depth + 1)) {
                    yield reference
                    if (limit && ++i >= limit) {
                        return
                    }
                }
            }
            return
        }

        const dependencyName = path.basename(rootDirectory)
        const packageSearcher = new this.packageReferenceSearcher(
            this.package,
            new Dependency(dependencyName, new Package("hack", path.dirname(rootDirectory))),
            includeKinds
        )
        await packageSearcher.initialize()
        yield* packageSearcher.searchReferences(rootDirectory)
    }
}

type ConcretePackageReferenceSearcher = (new (
    $package: Package,
    dependency: Dependency,
    includeKinds?: ReadonlyArray<ReferenceKind> | '*'
) => PackageReferenceSearcher)

const ALL_REFERENCE_SEARCHER_STRATEGIES = [
    'heuristic',
    'types'
] as const
export type ReferenceSearcherStrategy = (typeof ALL_REFERENCE_SEARCHER_STRATEGIES)[number]

export abstract class PackageReferenceSearcher {
    /** TODOS for later:
     * Honor package-specific module configurations such as webpack that can rename modules
     * What about babel transformations? 😱
     */
    constructor(
        public $package: Package,
        public dependency: Dependency,
        public includeKinds: ReadonlyArray<ReferenceKind> | '*' = ['usage']
    ) { }

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

    static create($package: Package, dependency: Dependency, strategy: ReferenceSearcherStrategy) {
        return new (this.forStrategy(strategy))($package, dependency)
    }

    static forStrategy(strategy: ReferenceSearcherStrategy): ConcretePackageReferenceSearcher {
        switch (strategy) {
            case 'heuristic':
                return HeuristicPackageReferenceSearcher
            case 'types':
                return TypePackageReferenceSearcher
        }
    }

    async initialize() {
        // Stub method for subclasses.
    }

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

    protected abstract basicSearchReferences(rootDirectory: string): AsyncGenerator<Reference, void, undefined>

    protected async findAllSourceFiles(rootDirectory: string) {
        // Exclude bundled and minified files
        return await glob('**{/!(dist)/,}!(*.min|dist).{js,ts}', {
            cwd: rootDirectory,
            nodir: true
        })
    }
}

class HeuristicPackageReferenceSearcher extends PackageReferenceSearcher {
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

    async* basicSearchReferences(rootDirectory: string) {
        for (const file of await this.findAllSourceFiles(rootDirectory)) {
            yield* this.searchReferencesInFile(rootDirectory, file)
        }
    }

    async* searchReferencesInFile(rootDirectory: string, filePath: string) {
        const fullPath = path.join(rootDirectory, filePath)
        const fileSize = (await fsPromises.stat(fullPath)).size
        if (fileSize > HeuristicPackageReferenceSearcher.maximumFileSize) {
            console.warn(`Skipping very large file`, { dependencyName: this.dependency.name, fullPath })
            return
        }

        const source = fs.readFileSync(fullPath).toString()

        const importBindings = await asyncIteratorToArray(this.collectModuleBindings(source))
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
                    file: filePath,
                    position,
                    kind: isImport ? 'import' : 'usage',
                    declarationMemberName: binding.memberName,
                    declarationMemberPath: binding.memberName == null || binding.memberName == undefined ? binding.memberName : [binding.memberName],
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
                // TODO: Increase robustness by stripping of everything below import statements
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
                         * Here we assume the more common CommonJS case and thus fall back to undefined.
                         *
                         * TODO: Create parameter to indicate the module type for packageName. */
                        ?? undefined,
                    alias: match.groups.alias,
                    index: match.index
                }
            })
            .value()
    }
}

class TypePackageReferenceSearcher extends PackageReferenceSearcher {
    protected typeChecker!: ts.TypeChecker
    protected references!: Reference[]
    protected dependencyDirectory!: string

    protected get packageDirectory() {
        const directory = this.$package.directory
        assert(directory, `No package directory was specified for package ${this.$package.name}`)
        return directory
    }

    async* basicSearchReferences(rootDirectory: string) {
        this.dependencyDirectory = rootDirectory
        try {
            const options = this.loadOptions()

            const allFileNames = (
                await this.findAllSourceFiles(this.dependencyDirectory)
            ).map(file => path.join(this.dependencyDirectory, file))
            if (!options.fileNames.length) {
                console.warn("No file names passed, searching whole repository", { dependencyName: this.dependency.name })
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
                if (this.includeKinds != '*') {
                    this.references = this.references.filter(reference => this.includeKinds.includes(reference.kind))
                }
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
                [this.$package.name]: [
                    ...((options.options.paths ?? {})[this.$package.name] ?? []),
                    path.resolve(this.packageDirectory)
                ],
                // Same for submodules of our package
                [`${this.$package.name}/*`]: [
                    ...((options.options.paths ?? {})[`${this.$package.name}/*`] ?? []),
                    `${path.resolve(this.packageDirectory)}/*`
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

    protected createReference(node: ts.Node, kind: ReferenceKind, symbol?: ts.Symbol, aliasCallback?: (file: ts.SourceFile) => string | undefined) {
        const declaration = symbol ? this.findDeclarationForSymbol(symbol) : this.findDeclarationForNode(node)
        if (!declaration) {
            return
        }

        const file = node.getSourceFile()
        const { line, character } = file.getLineAndCharacterOfPosition(node.getStart())

        const matchString = node.getText(file)

        const memberPath = this.getNodePath(node.parent)
        const { file: declarationFile, memberPath: declarationMemberPath, memberName: declarationMemberName } = this.getFullQualifiedName(declaration, kind == 'import')
        return new Reference({
            dependency: this.dependency,
            file: path.relative(this.dependencyDirectory, file.fileName),
            position: new FilePosition({ row: line + 1, column: character + 1 }),
            memberPath,
            declarationFile: declarationFile,
            declarationMemberPath: declarationMemberPath,
            declarationMemberName: declarationMemberName,
            kind: kind,
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
            path.resolve(this.packageDirectory))
        )
    }

    protected getCallLikeNode(node: ts.CallLikeExpression) {
        if (ts.isTaggedTemplateExpression(node)) {
            return node.tag
        }
        if (ts.isJsxOpeningLikeElement(node)) {
            return node
        }
        return node.expression
    }

    protected getNodePath(node: ts.Node): string[] | undefined {
        //console.log({node})
        const symbol = !(ts.isVariableDeclaration(node) || ts.isExportAssignment(node) || ts.isPropertyAssignment(node) || ts.isExportDeclaration(node))
            && (<Partial<{ symbol: ts.Symbol }>>node).symbol
        if (!symbol) {
            return this.getNodePath(node.parent)
        }

        const result = this.getShortRelativeQualifiedName(symbol)?.path
        if (result && node.getSourceFile().fileName.endsWith('gatsby-remark-images/index.js')) {
            //console.log({result, node, symbol, fileName: node.getSourceFile().fileName})
        }
        //console.log('-')
        return result
    }

    // TODO: Align format with heuristic approach later? On the other hand, maybe we will not need it anyway.
    protected getFullQualifiedName(declaration: ts.Declaration, isImport: boolean) {
        const symbol = (<Partial<{ symbol: ts.Symbol }>>declaration).symbol
        const nameAndPath = symbol && (isImport
            ? this.isDefaultExport(symbol, declaration) || symbol.flags & ts.SymbolFlags.Module
                ? undefined
                : { name: symbol.name, path: [] }
            : this.getRelativeQualifiedName(symbol))
        const relativePath = path.relative(this.packageDirectory, declaration.getSourceFile().fileName)
        const shortRelativePath = relativePath.replace(/\.([^.]+|d\.ts)$/, '')
        return {
            file: relativePath,
            memberPath: nameAndPath?.path,
            memberName: nameAndPath?.name ? `${shortRelativePath}/${nameAndPath.name}` : shortRelativePath
        }
    }

    protected getRelativeQualifiedName(symbol: ts.Symbol): { name: string, path: string[] } | null | undefined {
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
            while (parentNode && !((parent = (<{ symbol: ts.Symbol }><unknown>parentNode).symbol) && parent.name != '__object')) {
                parentNode = parentNode.parent
            }
        }
        const symbolName = this.typeChecker.symbolToString(symbol)
        const parentNameAndPath = parent ? this.getRelativeQualifiedName(parent) : null
        const parentName = parentNameAndPath?.name
        const parentPath = parentNameAndPath?.path
        if (!parentName) {
            return {
                name: symbolName,
                path: [symbolName]
            }
        }
        const parentShortName = parentName.replace(/\.(js|ts|d\.ts)$/, '')
        return {
            name: `${parentShortName}.${symbolName}`,
            path: [...parentPath ?? [], symbolName]
        }
    }

    protected getShortRelativeQualifiedName(symbol: ts.Symbol): { name: string, path: string[] } | null | undefined {
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
            while (!((parent = (<{ symbol: ts.Symbol }><unknown>parentNode).symbol)
                && !(['__object', 'export=', 'exports'].includes(parent.name))
                && !(ts.isVariableDeclaration(parentNode) || ts.isExportAssignment(parentNode) || ts.isPropertyAssignment(parentNode) || ts.isExportDeclaration(parentNode)))
            ) {
                parentNode = parentNode.parent
            }
        }
        if (!parent) {
            return undefined
        }
        const symbolName = this.typeChecker.symbolToString(symbol)
        const parentNameAndPath = this.getShortRelativeQualifiedName(parent)
        const parentName = parentNameAndPath?.name
        const parentPath = parentNameAndPath?.path
        if (!parentName) {
            return {
                name: symbolName,
                path: [symbolName]
            }
        }
        const parentShortName = parentName.replace(/\.(js|ts|d\.ts)$/, '')
        return {
            name: `${parentShortName}.${symbolName}`,
            path: [...parentPath ?? [], symbolName]
        }
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
