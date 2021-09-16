import normalizePackageData from 'normalize-package-data'
import tryToCatch from 'try-to-catch'
import vscode from 'vscode'

import { Dependency, Dowdep, Package, Reference, ReferenceSearcherStrategy } from 'dowdep'
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
    // protected dependenciesView: vscode.TreeView<DependencyItem> // will be needed to reveal()

    private get modelObservers() {
        return [
            this.dependenciesProvider,
            this.referencesProvider
        ]
    }

    constructor(
        context: vscode.ExtensionContext
    ) {
        this.dowdep = new Dowdep({
            //fs: vscode.workspace.fs
            // TODO: Use filesystem abstraction. When workspaces is changed, update storageUri!
            sourceCacheDirectory: vscode.Uri.joinPath(context.storageUri!, 'dowdep-cache').fsPath
        })
        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => this.configurationChanged()))
        this.configurationChanged()

        this.dependenciesProvider = new DependenciesProvider(this)
        vscode.window.createTreeView('dowdepDependencies', {
            treeDataProvider: this.dependenciesProvider
        })
        this.referencesProvider = new ReferencesProvider(this)
        vscode.window.createTreeView('dowdepReferences', {
            treeDataProvider: this.referencesProvider
        })

        this.createCommands(context)
    }

    private async configurationChanged() {
        this.dowdep.dependencyLimit = vscode.workspace.getConfiguration().get<number>('dowdep.dependencyLimit')
        this.dowdep.githubAccessToken = vscode.workspace.getConfiguration().get('dowdep.githubOAuthToken')
        this.dowdep.referenceSearchStrategy = vscode.workspace.getConfiguration().get<ReferenceSearcherStrategy>('dowdep.referenceSearchStrategy', 'types')
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
            vscode.commands.registerCommand('dowdep.openReferenceFileOrFolder', this.wrapWithLogger(
                (reference: Reference, relativePath: string) => this.openReferenceFileOrFolder(reference, relativePath)
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

        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: "Refreshing dependencies...",
            cancellable: true
        }, async (progress, cancellationToken) => {
            let canceling = false
            cancellationToken.onCancellationRequested(() => {
                canceling = true
            })

            let done = 0
            await Promise.all(
                this.packages.map(async $package => {
                    if (canceling) { return }
                    await this.refreshDependencies($package, cancellationToken)
                    progress.report({ increment: ++done / this.packages.length * 100 })
                })
            )
        })
    }

    async refreshAllReferences() {
        const allDependencies = this.packages.flatMap($package => $package.dependencies)
        if (!allDependencies.length) {
            await vscode.window.showWarningMessage("No dependencies were found in this workspace.")
            // TODO: Do we need to await this?
        }

        const thenable = vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: "Refreshing references...",
            cancellable: true
        }, async (progress, cancellationToken) => {
            let canceling = false
            cancellationToken.onCancellationRequested(() => {
                canceling = true
            })

            let done = 0
            await Promise.all(
                allDependencies.map(async dependency => {
                    if (canceling) { return }
                    await this.refreshReferences(dependency, cancellationToken)
                    progress.report({ increment: ++done / allDependencies.length * 100 })
                })
            )
        })
        return Promise.resolve(thenable)
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
        const position = new vscode.Position(reference.location.position.row - 1, (reference.location.position.column ?? 1) - 1) // TODO: Convenience method
        await vscode.window.showTextDocument(fileUri, {
            preview: true,
            selection: new vscode.Selection(position, position)
        })
    }

    async openReferenceFileOrFolder(reference: Reference, relativePath: string) {
        const packageDirectory = reference.dependency.$package.directory
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

    async refreshDependencies($package: Package, cancellationToken?: vscode.CancellationToken) {
        await $package.updateDependencies(
            this.dowdep, {
                downloadMetadata: true,
                downloadSource: true
            }, async () => {
                if (cancellationToken?.isCancellationRequested) {
                    throw new vscode.CancellationError()
                }
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
