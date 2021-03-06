import { DeclarationLocation, Dependency, Dowdep, FilePosition, loadExternalModules, Package, Reference, ReferenceSearchStrategy } from 'dowdep'
import _ from 'lodash'
import filterAsync from 'node-filter-async'
import normalizePackageData from 'normalize-package-data'
import tryToCatch from 'try-to-catch'
import vscode from 'vscode'

import { DeclarationCodeLensProvider } from './codeLens'
import { DependenciesProvider } from './dependencies'
import { ReferencesProvider } from './references'
import { HierarchyProvider } from './views'
import isDefined from './utils/node/isDefined'
import * as iterUtils from './utils/node/iterUtils'
import { escapeMarkdown } from './utils/vscode/markdown'


let extension: Extension | undefined = undefined
export { extension }

type DependencyLike = Dependency | readonly Dependency[] | PackageLike
type PackageLike = Package | readonly Package[]

/**
 * This method is called on the first activation event.
 */
export async function activate(context: vscode.ExtensionContext) {
    await loadExternalModules()

    extension = new Extension(context)
    extension.activate()

    console.log("The extension \"dowdep\" is now active.")
    return extension
}

/**
 * This method is called when the extension is deactivated.
 */
export function deactivate() {
    extension?.release()
}

/** The god class of the extension that connects to a {@link Dowdep} instance. */
export class Extension {
    extension: vscode.Extension<Extension> // TODO: Name clash!
    packages: Package[] = []
    dowdep: Dowdep
    dependenciesProvider: DependenciesProvider
    referencesProvider: ReferencesProvider
    codeLensProvider: DeclarationCodeLensProvider

    private dependencyLimitIncrement = 0
    private get modelObservers() {
        return [
            this.dependenciesProvider,
            this.referencesProvider,
            this.codeLensProvider
        ]
    }

    constructor(
        context: vscode.ExtensionContext
    ) {
        this.extension = context.extension

        this.dowdep = new Dowdep({
            //fs: vscode.workspace.fs
            // TODO: Use filesystem abstraction.
            sourceCacheDirectory: vscode.Uri.joinPath(context.globalStorageUri, 'dowdep-cache').fsPath
        })
        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => this.configurationChanged()))
        this.configurationChanged()

        this.dependenciesProvider = new DependenciesProvider(this).register()
        this.referencesProvider = new ReferencesProvider(this).register()
        this.codeLensProvider = new DeclarationCodeLensProvider(this).register()

        this.createCommands(context)
    }

    private async configurationChanged() {
        const configuration = vscode.workspace.getConfiguration()
        this.dowdep.dependencyLimit = configuration.get<number>('dowdep.dependencyLimit')
        this.dependencyLimitIncrement = configuration.get<number>('dowdep.dependencyLimitIncrement', 0)
        this.dowdep.githubAccessToken = configuration.get('dowdep.githubOAuthToken')
        this.dowdep.sourcegraphToken = configuration.get('dowdep.sourcegraphToken')
        this.dowdep.dependencySearchStrategies = configuration.get<Dowdep['dependencySearchStrategies'] | null>('dowdep.dependencySearchStrategies', null) ?? (this.dowdep.sourcegraphToken ? '*' : ['npm'])
        this.dowdep.referenceSearchStrategy = configuration.get<ReferenceSearchStrategy>('dowdep.referenceSearchStrategy', 'types')
        if (this.dowdep.referenceSearchStrategy === 'heuristic') {
            await vscode.window.showWarningMessage("The heuristic search strategy is currently not supported because of extremely complicated import errors, sigh ...\n\nFurther information: https://github.com/TomerAberbach/parse-imports/issues/3")
        }
    }

    private createCommands(context: vscode.ExtensionContext) {
        this.createGlobalCommands(context)
        this.createOpenCommands(context)
        this.createTreeDataCommands(context)
    }

    private createGlobalCommands(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.refreshPackages', this.catchErrors(
                () => this.refreshPackages()
            )))
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.refreshDependencies', this.catchErrors(
                ($package?: PackageLike) => this.refreshDependencies($package)
            )))
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.refreshReferences', this.catchErrors(
                (dependency?: DependencyLike) => this.refreshReferences(dependency)
            )))
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.refreshDownstreamData', this.catchErrors(
                ($package?: PackageLike) => this.refreshDownstreamData($package)
            )))
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.fetchMoreDownstreamData', this.catchErrors(
                () => this.fetchMoreDownstreamData()
            )))
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.openSettings', this.catchErrors(
                () => this.openSettings()
            )))
    }

    private createOpenCommands(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.openPackage', this.catchErrors(
                ($package: Package) => this.openPackage($package)
            )))
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.openDependency', this.catchErrors(
                (dependency: Dependency) => this.openDependency(dependency)
            )))
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.openDependencyExternally', this.catchErrors(
                (dependency: Dependency) => this.openDependencyExternally(dependency)
            )))
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.openDependencyFolder', this.catchErrors(
                (dependency: Dependency, relativePath: string) => this.openDependencyFolder(dependency, relativePath)
            )))
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.openReference', this.catchErrors(
                (reference: Reference) => this.openReference(reference)
            )))
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.openPackageFileOrFolder', this.catchErrors(
                ($package: Package, relativePath: string) => this.openPackageFileOrFolder($package, relativePath)
            )))
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.openPackageMember', this.catchErrors(
                ($package: Package, location: DeclarationLocation) => this.openPackageMember($package, location)
            )))

        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.browseMemberDependencies', this.catchErrors(
                ($package: Package, location: DeclarationLocation) => this.browseMemberDependencies($package, location)
            )))
    }

    private createTreeDataCommands(context: vscode.ExtensionContext) {
        for (const commandProvider of [HierarchyProvider, DependenciesProvider, ReferencesProvider]) {
            commandProvider.createCommands((name, callback) =>
                context.subscriptions.push(
                    vscode.commands.registerCommand(name, this.catchErrors(callback))))
        }
    }

    activate() {
        this.refreshPackages()
    }

    release() {
        return
    }

    /** Refresh the list of packages. */
    async refreshPackages() {
        this.packages = await this.getWorkspacePackages()
        if (!this.packages.length) {
            await vscode.window.showWarningMessage("No packages were found in this workspace.")
        }
        await this.notifyModelObservers()
    }

    /** Refresh the list of dependencies for all packages. */
    async refreshDependencies($package?: PackageLike): Promise<void> {
        const packages = await this.getPackages($package)

        await this.doCancellable(async () => {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Window,
                title: "Refreshing dependencies...",
                cancellable: true
            }, async (progress, cancellationToken) => {
                let canceling = false
                cancellationToken.onCancellationRequested(() => {
                    canceling = true
                })
                let progressValue = 0

                await Promise.all(
                    packages.map(async $package => {
                        if (canceling) { return }
                        await this.basicRefreshDependencies($package, cancellationToken, async () => {
                            if (this.dowdep.dependencyLimit) {
                                const readyPackageDependencies = await Promise.all(packages.map($package => filterAsync(
                                    [...$package.dependencies],
                                    async dependency => await dependency.isSourceCodeReady(this.dowdep)))
                                )
                                const newProgressValue = _.sumBy(
                                    readyPackageDependencies,
                                    dependencies => dependencies.length
                                ) / (packages.length * this.dowdep.dependencyLimit) * 100
                                const increment = newProgressValue - progressValue
                                progressValue = newProgressValue
                                progress.report({ increment })
                            }
                        })
                    })
                )
            })
        })
    }

    /** Refresh the list of usage samples for all dependencies. */
    async refreshReferences(dependency?: DependencyLike): Promise<void> {
        const dependencies = await this.getDependencies(dependency)

        this.doCancellable(async () => {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Window,
                title: "Refreshing references...",
                cancellable: true
            }, async (progress, cancellationToken) => {
                let canceling = false
                cancellationToken.onCancellationRequested(() => {
                    canceling = true
                })

                await Promise.all(
                    dependencies.map(async dependency => {
                        if (canceling) { return }
                        await this.basicRefreshReferences(dependency, cancellationToken)
                        progress.report({ increment: 100 / dependencies.length })
                    })
                )
            })
        })
    }

    /** Refresh the list of dependencies for all packages and the list of usage samples for each dependency. */
    async refreshDownstreamData($package?: PackageLike): Promise<void> {
        const packages = await this.getPackages($package)

        // TODO: Deduplicate
        if (!packages.length) {
            await vscode.window.showWarningMessage("No packages were found in this workspace.")
        }

        await this.doCancellable(async () => {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Window,
                title: "Refreshing downstream data...",
                cancellable: true
            }, async (progress, cancellationToken) => {
                let canceling = false
                cancellationToken.onCancellationRequested(() => {
                    canceling = true
                })
                const halfIncrement = this.dowdep.dependencyLimit
                    ? 100 / (packages.length * this.dowdep.dependencyLimit) / 2
                    : undefined
                const readyDependencies: Dependency[] = []

                await Promise.all(
                    packages.map(async $package => {
                        if (canceling) { return }
                        await this.basicRefreshDependencies($package, cancellationToken, async () => {
                            const readyPackageDependencies = await Promise.all(packages.map($package => filterAsync(
                                [...$package.dependencies],
                                async dependency => await dependency.isSourceCodeReady(this.dowdep)))
                            )
                            const newReadyDependencies = readyPackageDependencies.flat().filter(
                                dependency => !readyDependencies.includes(dependency)
                            )
                            readyDependencies.push(...newReadyDependencies)

                            if (canceling) { return }

                            await Promise.all(newReadyDependencies.map(async dependency => {
                                progress.report({ increment: halfIncrement })
                                await this.basicRefreshReferences(dependency, cancellationToken)
                                progress.report({ increment: halfIncrement })
                            }))
                        })
                    })
                )
            })
        })
    }

    async fetchMoreDownstreamData() {
        const newLimit = (this.dowdep.dependencyLimit ?? 0) + this.dependencyLimitIncrement
        await vscode.workspace.getConfiguration().update('dowdep.dependencyLimit', newLimit)

        return await this.refreshDownstreamData()
    }

    async openSettings() {
        await vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${this.extension.id}`)
    }

    async openPackage($package: Package) {
        if (!$package.directory) {
            return
        }
        await vscode.commands.executeCommand(
            'revealInExplorer',
            vscode.Uri.parse($package.directory)
        )
    }

    async openDependency(dependency: Dependency) {
        let uri: vscode.Uri | null = null

        if (dependency.sourceDirectory) {
            const directoryUri = vscode.Uri.file(dependency.sourceDirectory)
            uri = await this.findRepresentativeFile(directoryUri)
            if (uri && uri.path.endsWith('.md')) {
                await vscode.commands.executeCommand('markdown.showPreview', <vscode.Uri>uri)
                return
            }
        }

        if (!uri && dependency.urls.size) {
            uri = vscode.Uri.parse(iterUtils.first(dependency.urls.values()))
        }
        if (uri) {
            await vscode.commands.executeCommand('vscode.open', uri)
            return
        }

        await vscode.window.showErrorMessage("Cannot open this dependency")
    }

    async openDependencyExternally(dependency: Dependency) {
        const urls = dependency.urls
        if (!urls.size) {
            throw new Error("Cannot open dependency online")
        }
        let target: {
            label: string,
            url: string
        }
        if (urls.size === 1) {
            const url = iterUtils.first(urls.entries())
            target = {
                label: url[0],
                url: url[1]
            }
        } else {
            const choice = await vscode.window.showQuickPick(
                _.map([...urls.entries()], ([label, url]) => ({
                    target: { label, url },
                    label: escapeMarkdown(label),
                    description: escapeMarkdown(url)
                })),
                {
                    title: "Choose platform"
                }
            )
            if (!choice) {
                return
            }
            target = choice.target
        }

        const uri = vscode.Uri.parse(target.url)
        await vscode.commands.executeCommand('vscode.open', uri)
    }

    async openDependencyFolder(dependency: Dependency, relativePath: string) {
        if (!dependency.sourceDirectory) {
            await vscode.window.showErrorMessage("Source code is not downloaded")
            return
        }
        const directoryUri = vscode.Uri.file(dependency.sourceDirectory)
        const fileUri = vscode.Uri.joinPath(directoryUri, relativePath)
        if ((await vscode.workspace.fs.stat(fileUri)).type === vscode.FileType.Directory) {
            console.warn("Will not open dependency directory", fileUri)
            return
        }
        await vscode.commands.executeCommand('vscode.open', fileUri)
    }

    async openReference(reference: Reference) {
        if (!reference.dependency.sourceDirectory) {
            await vscode.window.showErrorMessage("Source code is not downloaded")
            return
        }
        const directoryUri = vscode.Uri.file(reference.dependency.sourceDirectory)
        const fileUri = vscode.Uri.joinPath(directoryUri, reference.location.file)
        const position = positionToVscode(reference.location.position)
        await vscode.window.showTextDocument(fileUri, {
            preview: true,
            selection: new vscode.Selection(position, position)
        })
    }

    async openPackageFileOrFolder($package: Package, relativePath: string) {
        const packageDirectory = $package.directory
        if (!packageDirectory) {
            return
        }
        const rootUri = vscode.Uri.file(packageDirectory)
        const fileUri = vscode.Uri.joinPath(rootUri, relativePath)
        const isDirectory = (await vscode.workspace.fs.stat(fileUri)).type === vscode.FileType.Directory
        if (isDirectory) {
            await vscode.commands.executeCommand('revealInExplorer', fileUri)
        } else {
            await vscode.commands.executeCommand('vscode.open', fileUri)
        }
    }

    async openPackageMember($package: Package, location: DeclarationLocation) {
        const packageDirectory = $package.directory
        if (!packageDirectory) {
            return
        }
        const rootUri = vscode.Uri.file(packageDirectory)
        const fileUri = vscode.Uri.joinPath(rootUri, location.file)
        const position = positionToVscode(location.position)
        await vscode.window.showTextDocument(fileUri, {
            preview: true,
            selection: new vscode.Selection(position, position)
        })
    }

    async browseMemberDependencies($package: Package, location: DeclarationLocation) {
        this.referencesProvider.revealPackageMemberItem($package, location)
    }

    async basicRefreshDependencies($package: Package, cancellationToken?: vscode.CancellationToken, updateCallback?: () => Promise<void>) {
        await $package.updateDependencies(
            this.dowdep, {
                downloadMetadata: true,
                downloadSource: true
            }, async () => {
                if (cancellationToken?.isCancellationRequested) {
                    throw new vscode.CancellationError()
                }
                await updateCallback?.()
                await this.notifyModelObservers()
            })
    }

    async basicRefreshReferences(dependency: Dependency, cancellationToken?: vscode.CancellationToken) {
        await dependency.updateReferences(this.dowdep, async () => {
            if (cancellationToken?.isCancellationRequested) {
                throw new vscode.CancellationError()
            }
            await this.notifyModelObservers()
        })
    }

    protected async getPackages($package?: PackageLike) {
        if (!$package) {
            return await this.getAllPackages()
        }

        return _.isArrayLike($package)
            ? $package
            : [$package]
    }

    protected async getDependencies(dependency?: DependencyLike): Promise<readonly Dependency[]> {
        if (!dependency) {
            return await this.getDependencies(await this.getPackages())
        }

        if (_.isArrayLike(dependency)) {
            const allDependencies = await Promise.all(dependency.map(
                async _dependency => await this.getDependencies(_dependency)
            ))
            return allDependencies.flat()
        }

        if (dependency instanceof Package) {
            return dependency.dependencies
        }

        return [dependency]
    }

    private async getAllPackages() {
        if (!this.packages.length) {
            await vscode.window.showWarningMessage("No packages were found in this workspace.")
        }
        return this.packages
    }

    /** Run the passed function, and return immediately if an {@link vscode.CancellationError} is raised. */
    private doCancellable<TIn extends unknown[], TOut>(fun: (...args: TIn) => TOut, ...args: TIn) {
        try {
            return fun(...args)
        } catch (error) {
            if (error instanceof vscode.CancellationError) {
                // Ignore
            } else {
                throw error
            }
        }
    }

    /** Run the passed function and catch any errors that are signaled and report them to the user. */
    private catchErrors<TIn extends unknown[], TOut>(fun: (...args: TIn) => Promise<TOut>) {
        return async (...args: TIn) => {
            try {
                return await fun(...args)
            } catch (error) {
                console.error(error)
                vscode.window.showErrorMessage(error instanceof Error ? error.toString() : `Error: ${error}`)
            }
        }
    }

    /** The model has changed. Inform all observers that they need to update their views. */
    private async notifyModelObservers() {
        this.updateActivationState()

        await Promise.all(this.modelObservers.map(
            observer => observer.modelChanged()))
    }

    private updateActivationState() {
        vscode.commands.executeCommand('setContext', 'dowdep.activationState',
            !this.packages
                ? 0
                : !this.packages.some($package => $package.dependencies.length)
                    ? 1
                    : 2)
    }

    /** Find all declared node packages in the current workspace. */
    private async getWorkspacePackages() {
        const folders = vscode.workspace.workspaceFolders
        if (!folders) {
            return []
        }

        return (await Promise.all(
            folders.map(async folder => {
                const [error, $package] = await tryToCatch(() => this.getWorkspacePackage(folder))
                if (error) {
                    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
                        return
                    }
                    await vscode.window.showErrorMessage(`Failed to read package in ${folder.uri}\n\n${error}`)
                    return
                }
                return $package
            })
        )).filter(isDefined)
    }

    private async getWorkspacePackage(folder: vscode.WorkspaceFolder) {
        const packageJsonUri = vscode.Uri.joinPath(folder.uri, 'package.json')
        const packageData = await this.readPackageData(packageJsonUri)

        return new Package(packageData.name, //folder.uri.toString())
            folder.uri.fsPath // WORKAROUND
        )
    }

    private async readPackageData(uri: vscode.Uri) {
        const buffer = Buffer.from(await vscode.workspace.fs.readFile(uri))
        const data = <normalizePackageData.Package>JSON.parse(buffer.toString('utf-8'))
        normalizePackageData(data)
        return data
    }

    /** Find a representative file for the package in the specified {@link directoryUri} that can be used for displaying a preview of this package. */
    private async findRepresentativeFile(directoryUri: vscode.Uri) {
        try {
            if ((await vscode.workspace.fs.stat(directoryUri)).type === vscode.FileType.File) {
                return directoryUri
            }
        } catch {
            // Directory does not exist
            return null
        }

        const allFiles = (await vscode.workspace.fs.readDirectory(directoryUri)).filter(
            ([_, type]) => type !== vscode.FileType.Directory
        )
        if (!allFiles.length) {
            return null
        }

        // Find representative files or fall back to any file
        let file: string | undefined = undefined
        for (const pattern of [
            'README.md',
            /^readme(\..+)?$/,
            'package.json',
            /^(src\/)?index\..+$/
        ]) {
            file ??= allFiles.find(([name,]) => pattern instanceof RegExp ? name.match(pattern) : name === pattern)?.[0]
        }
        file ??= allFiles[0][0]
        return file ? vscode.Uri.joinPath(directoryUri, file) : null
    }
}

export function positionToVscode(position: FilePosition) {
    return new vscode.Position(position.row - 1, (position.column ?? 1) - 1)
}
