import { DeclarationLocation, Dependency, Dowdep, FilePosition, Package, Reference, ReferenceSearchStrategy } from 'dowdep'
import _ from 'lodash'
import filterAsync from 'node-filter-async'
import normalizePackageData from 'normalize-package-data'
import tryToCatch from 'try-to-catch'
import vscode from 'vscode'

import { DeclarationCodeLensProvider } from './codeLens'
import { DependenciesProvider } from './dependencies'
import { ReferencesProvider } from './references'
import isDefined from './utils/node/isDefined'
import { HierarchyProvider } from './views'


let extension: Extension

/**
 * This method is called on the first activation event.
 */
export function activate(context: vscode.ExtensionContext) {
    console.log("The extension \"dowdep\" is now active.")

    extension = new Extension(context)

    extension.activate()
}

/**
 * This method is called when the extension is deactivated.
 */
export function deactivate() {
    extension.release()
}

export class Extension {
    packages: Package[] = []
    protected dowdep: Dowdep
    protected dependenciesProvider: DependenciesProvider
    protected referencesProvider: ReferencesProvider
    protected codeLensProvider: DeclarationCodeLensProvider

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
        this.dowdep = new Dowdep({
            //fs: vscode.workspace.fs
            // TODO: Use filesystem abstraction. When workspaces is changed, update storageUri!
            sourceCacheDirectory: vscode.Uri.joinPath(context.globalStorageUri!, 'dowdep-cache').fsPath
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
        this.dowdep.githubAccessToken = configuration.get('dowdep.githubOAuthToken')
        this.dowdep.sourcegraphToken = configuration.get('dowdep.sourcegraphToken')
        this.dowdep.dependencySearchStrategies = configuration.get<Dowdep['dependencySearchStrategies'] | null>('dowdep.dependencySearchStrategies', null) ?? this.dowdep.sourcegraphToken ? '*' : ['npm']
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
            vscode.commands.registerCommand('dowdep.refreshPackages', this.wrapWithLogger(
                () => this.refreshPackages()
            )))
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.refreshAllDependencies', this.wrapWithLogger(
                () => this.refreshAllDependencies()
            )))
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.refreshAllReferences', this.wrapWithLogger(
                () => this.refreshAllReferences()
            )))
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.refreshAllDependenciesAndReferences', this.wrapWithLogger(
                () => this.refreshAllDependenciesAndReferences()
            )))
    }

    private createOpenCommands(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.openPackage', this.wrapWithLogger(
                ($package: Package) => this.openPackage($package)
            )))
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.openDependency', this.wrapWithLogger(
                (dependency: Dependency) => this.openDependency(dependency)
            )))
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.openDependencyFolder', this.wrapWithLogger(
                (dependency: Dependency, relativePath: string) => this.openDependencyFolder(dependency, relativePath)
            )))
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.openReference', this.wrapWithLogger(
                (reference: Reference) => this.openReference(reference)
            )))
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.openPackageFileOrFolder', this.wrapWithLogger(
                ($package: Package, relativePath: string) => this.openPackageFileOrFolder($package, relativePath)
            )))
        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.openPackageMember', this.wrapWithLogger(
                ($package: Package, location: DeclarationLocation) => this.openPackageMember($package, location)
            )))

        context.subscriptions.push(
            vscode.commands.registerCommand('dowdep.browseMemberDependencies', this.wrapWithLogger(
                ($package: Package, location: DeclarationLocation) => this.browseMemberDependencies($package, location)
            )))
    }

    private createTreeDataCommands(context: vscode.ExtensionContext) {
        for (const commandProvider of [HierarchyProvider, DependenciesProvider, ReferencesProvider]) {
            commandProvider.createCommands((name, callback) =>
                context.subscriptions.push(
                    vscode.commands.registerCommand(name, this.wrapWithLogger(callback))))
        }
    }

    activate() {
        this.refreshPackages()
    }

    release() {
        return
    }

    async refreshPackages() {
        this.packages = await this.getPackages()
        if (!this.packages.length) {
            await vscode.window.showWarningMessage("No packages were found in this workspace.")
            // TODO: Only show warning if no error was shown earlier during getPackages()
            // TODO: Do we need to await this?
        }
        await this.notifyModelObservers()
    }

    async refreshAllDependencies() {
        if (!this.packages.length) {
            await vscode.window.showWarningMessage("No packages were found in this workspace.")
            // TODO: Do we need to await this?
        }

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
                    this.packages.map(async $package => {
                        if (canceling) { return }
                        await this.refreshDependencies($package, cancellationToken, async () => {
                            if (this.dowdep.dependencyLimit) {
                                const readyPackageDependencies = await Promise.all(this.packages.map($package => filterAsync([...$package.dependencies], async dependency => await dependency.isSourceCodeReady(this.dowdep))))
                                const newProgressValue = _.sumBy(
                                    readyPackageDependencies,
                                    dependencies => dependencies.length
                                ) / (this.packages.length * this.dowdep.dependencyLimit) * 100
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

    async refreshAllReferences() {
        const allDependencies = this.packages
            .flatMap($package => $package.dependencies)
            .filter(dependency => dependency.sourceDirectory)
        if (!allDependencies.length) {
            await vscode.window.showWarningMessage("No dependencies were found in this workspace.")
            // TODO: Do we need to await this?
        }

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
                    allDependencies.map(async dependency => {
                        if (canceling) { return }
                        await this.refreshReferences(dependency, cancellationToken)
                        progress.report({ increment: 100 / allDependencies.length })
                    })
                )
            })
        })
    }

    async refreshAllDependenciesAndReferences() {
        // TODO: Deduplicate
        if (!this.packages.length) {
            await vscode.window.showWarningMessage("No packages were found in this workspace.")
        }

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
                const readyDependencies: Dependency[] = []

                await Promise.all(
                    this.packages.map(async $package => {
                        if (canceling) { return }
                        await this.refreshDependencies($package, cancellationToken, async () => {
                            const readyPackageDependencies = await Promise.all(this.packages.map($package => filterAsync([...$package.dependencies], async dependency => await dependency.isSourceCodeReady(this.dowdep)))) // TODO: thread-safe?
                            const newReadyDependencies = readyPackageDependencies.flat().filter(dependency => !readyDependencies.includes(dependency))
                            readyDependencies.push(...newReadyDependencies)

                            if (canceling) { return }

                            await Promise.all(newReadyDependencies.map(async dependency => {
                                if (this.dowdep.dependencyLimit) {
                                    progress.report({ increment: 100 / (this.packages.length * this.dowdep.dependencyLimit) / 2 })
                                }
                                await this.refreshReferences(dependency, cancellationToken)
                                if (this.dowdep.dependencyLimit) {
                                    progress.report({ increment: 100 / (this.packages.length * this.dowdep.dependencyLimit) / 2 })
                                }
                            }))
                        })
                    })
                )
            })
        })
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
        if (!dependency.sourceDirectory) {
            await vscode.window.showErrorMessage("Source code is not downloaded")
            return
        }
        const directoryUri = vscode.Uri.file(dependency.sourceDirectory)
        const fileUri = vscode.Uri.joinPath(directoryUri, 'README.md')
        // TODO: If does not exist, try with 'readme' from package.json, 'src'/'main' from package.json, package.json itself, or else fall back to URL
        await vscode.commands.executeCommand('markdown.showPreview', fileUri)
    }

    async openDependencyFolder(dependency: Dependency, relativePath: string) {
        if (!dependency.sourceDirectory) {
            await vscode.window.showErrorMessage("Source code is not downloaded")
            return
        }
        const directoryUri = vscode.Uri.file(dependency.sourceDirectory)
        const fileUri = vscode.Uri.joinPath(directoryUri, relativePath)
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

    async refreshDependencies($package: Package, cancellationToken?: vscode.CancellationToken, updateCallback?: () => Promise<void>) {
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

    async refreshReferences(dependency: Dependency, cancellationToken?: vscode.CancellationToken) {
        await dependency.updateReferences(this.dowdep, async () => {
            if (cancellationToken?.isCancellationRequested) {
                throw new vscode.CancellationError()
            }
            await this.notifyModelObservers()
        })
    }

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

    private wrapWithLogger<TIn extends unknown[], TOut>(fun: (...args: TIn) => Promise<TOut>) {
        return async (...args: TIn) => {
            try {
                return await fun(...args)
            } catch (error) {
                console.error(error)
                throw error
            }
        }
    }

    private async notifyModelObservers() {
        await Promise.all(this.modelObservers.map(
            observer => observer.modelChanged()))
    }

    private async getPackages() {
        const folders = vscode.workspace.workspaceFolders
        if (!folders) {
            return []
        }

        return (await Promise.all(
            folders.map(async folder => {
                const [error, $package] = await tryToCatch(() => this.getPackage(folder))
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

    private async getPackage(folder: vscode.WorkspaceFolder) {
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
}

export function positionToVscode(position: FilePosition) {
    return new vscode.Position(position.row - 1, (position.column ?? 1) - 1)
}
