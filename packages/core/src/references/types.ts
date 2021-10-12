import { strict as assert } from 'assert'
import { promises as fsPromises } from 'fs'
import _ from 'lodash'
import path from 'path'
import pathIsInside from 'path-is-inside'
import tryCatch from 'try-catch'
import ts from 'typescript'

import { DeclarationLocation, FilePosition, ReferenceSearcher, Reference, ReferenceKind, ReferenceLocation } from './base'


/** A reference searcher that uses the TypeScript Compiler API to identify AST nodes that invoke a type from the target package. */
export class TypeReferenceSearcher extends ReferenceSearcher {
    protected typeChecker!: ts.TypeChecker
    protected references!: Reference[]

    /** In bytes (B). */
    protected static maximumFileSize = 10_000_000

    protected get dependencyDirectory() {
        return this.dependency.sourceDirectory
    }
    protected get packageDirectory() {
        const directory = this.$package.directory
        assert(directory, `No package directory was specified for package ${this.$package.name}`)
        return directory
    }

    async* basicSearchReferences() {
        const options = this.loadOptions()

        const allFileNames = (
            await this.findAllSourceFiles(this.dependencyDirectory)
        ).map(file => path.join(this.dependencyDirectory, file))
        if (!options.fileNames.length) {
            if (!allFileNames.length) {
                console.warn("No files names passed or found, skipping repository", { dependencyName: this.dependency.name })
            } else if (allFileNames.length > 1000) {
                console.warn("No files names passed and too many hypothetical source files, skipping repository", { dependencyName: this.dependency.name })
            } else {
                console.warn("No file names passed, searching whole repository", { dependencyName: this.dependency.name })
                options.fileNames = allFileNames
            }
        }

        const totalFileSize = _.sumBy(await Promise.all(options.fileNames.map(name => fsPromises.stat(name))), x => x.size)
        if (totalFileSize > TypeReferenceSearcher.maximumFileSize) {
            console.warn("Too large source files, skipping repository", { dependencyName: this.dependency.name })
            return
        }

        const host = this.createCompilerHost(options.options)
        const program = ts.createProgram(options.fileNames, options.options, host)
        this.typeChecker = program.getTypeChecker()

        for (const sourceFile of program.getSourceFiles()) {
            const fileName = path.normalize(sourceFile.fileName)
            if (!options.fileNames.includes(fileName)) {
                // External library, maybe our own package
                continue
            }
            if (!allFileNames.includes(fileName)) {
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
    }

    loadOptions() {
        const options = this.parseOptions(this.dependencyDirectory, {
            allowJs: true,
            checkJs: true
        })
        options.fileNames = options.fileNames.map(path.normalize)

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
            if (path.basename(directoryName) == 'node_modules' && !(
                pathIsInside(path.resolve(directoryName), path.resolve(this.dependencyDirectory))
                    || pathIsInside(path.resolve(this.dependencyDirectory), path.resolve(directoryName))
                    || pathIsInside(path.resolve(directoryName), path.resolve(this.packageDirectory))
                    || pathIsInside(path.resolve(this.packageDirectory), path.resolve(directoryName)))) {
                // Stop module resolution outside relevant source folders - this might cause unintended side effects and will slow down search significantly
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
        // TODO: Support ElementAccess (x[y])
        if (ts.isPropertyAccessExpression(node) && !(
            ts.isCallLikeExpression(node.parent) && this.getCallLikeNode(node.parent) == node)
        ) {
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
        const matchString = node.getText(file)

        const memberPath = this.getNodePath(node.parent)
        const { file: declarationFile, memberPath: declarationMemberPath, memberName: declarationMemberName } = this.getFullQualifiedName(declaration, kind == 'import')
        return new Reference({
            dependency: this.dependency,
            location: new ReferenceLocation({
                file: path.relative(this.dependencyDirectory, file.fileName),
                position: this.getPosition(node, file),
                memberPath
            }),
            declaration: new DeclarationLocation({
                file: declarationFile,
                position: this.getPosition(declaration),
                memberPath: declarationMemberPath,
                memberName: declarationMemberName
            }),
            kind: kind,
            matchString: matchString,
            alias: aliasCallback ? aliasCallback(file) : matchString
        })
    }

    protected findDeclarationForNode(node: ts.Node) {
        const [, type] = tryCatch(this.typeChecker.getTypeAtLocation, node)
        const symbol = type?.symbol ?? type?.aliasSymbol
        if (!symbol) {
            return
        }
        return this.findDeclarationForSymbol(symbol)
    }

    protected findDeclarationForSymbol(symbol: ts.Symbol) {
        if (!symbol.declarations) {
            return
        }
        if ((symbol.declarations?.length ?? 0) > 10_000) {
            // Too many declarations (TypeScript mismatch), skipping
            return
        }
        return symbol.declarations.find(declaration => pathIsInside(
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
        const symbol = !(ts.isVariableDeclaration(node) || ts.isExportAssignment(node) || ts.isPropertyAssignment(node) || ts.isExportDeclaration(node))
            && (<Partial<{ symbol: ts.Symbol }>>node).symbol
        if (!symbol) {
            return this.getNodePath(node.parent)
        }

        return this.getShortRelativeQualifiedName(symbol)?.path
    }

    protected getFullQualifiedName(declaration: ts.Declaration, isImport: boolean) {
        const symbol = (<Partial<{ symbol: ts.Symbol }>>declaration).symbol
        const nameAndPath = symbol && (isImport
            ? this.isDefaultExport(symbol, declaration)
                ? undefined
                : symbol.flags & ts.SymbolFlags.Module
                    ? null
                    : { name: symbol.name, path: [] }
            : this.getRelativeQualifiedName(symbol))
        const relativePath = path.relative(this.packageDirectory, declaration.getSourceFile().fileName)
        const shortRelativePath = relativePath.replace(/\.([^.]+|d\.ts)$/, '')   // Remove file extension
        return {
            file: relativePath,
            memberPath: nameAndPath ? nameAndPath.path : nameAndPath,
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

    // TODO: Deduplicate
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
            while (parentNode
                && !((parent = (<{ symbol: ts.Symbol }><unknown>parentNode).symbol)
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

    private getPosition(node: ts.Node, sourceFile?: ts.SourceFile): FilePosition {
        if (!sourceFile) {
            return this.getPosition(node, node.getSourceFile())
        }

        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
        return new FilePosition({
            row: line + 1,
            column: character + 1
        })
    }
}
