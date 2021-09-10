import normalizePackageData from 'normalize-package-data'
//import tryToCatch from 'try-to-catch'
import tryToCatch from './utils/try-to-catch'
import vscode, { CancellationError } from 'vscode'

import { Dependency, Dowdep, Package, Reference } from 'dowdep'
import { DependenciesProvider } from './DependenciesProvider'
import isDefined from './utils/isDefined'


let extension: Extension

/**
 * This method is called the very first time any command is executed.
 */
export function activate(context: vscode.ExtensionContext) {
    console.log("The extension \"dowdep\" is now active.")

    extension = new Extension(context)
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
    // protected dependenciesView: vscode.TreeView<DependencyItem> // will be needed to reveal()
    // TODO: only define type information that are needed here?

    constructor(
        context: vscode.ExtensionContext
    ) {
        this.dowdep = new Dowdep({
            //fs: vscode.workspace.fs
            sourceCacheDirectory: vscode.Uri.joinPath(context.storageUri!, 'dowdep-cache').fsPath, // TODO: filesystem ...
            dependencyLimit: 10,
            githubAccessToken: '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' // 🔺 DO NOT COMMIT 🔺
        })

        this.dependenciesProvider = new DependenciesProvider(this)
        vscode.window.createTreeView('dowdepDependencies', {
            treeDataProvider: this.dependenciesProvider
        })

        this.createCommands(context)
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
    }

    private createTreeDataCommands(context: vscode.ExtensionContext) {
        DependenciesProvider.createCommands((name, callback) =>
            context.subscriptions.push(
                vscode.commands.registerCommand(name, this.wrapWithLogger(callback))
            ))
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
        this.notifyModelObservers()
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
        const fileUri = vscode.Uri.joinPath(directoryUri, reference.file)
        const document = await vscode.workspace.openTextDocument(fileUri)
        const position = new vscode.Position(reference.position.row - 1, (reference.position.column ?? 1) - 1)
        await vscode.window.showTextDocument(document, {
            preview: true,
            selection: new vscode.Selection(position, position)
        })
    }

    async refreshDependencies($package: Package, cancellationToken?: vscode.CancellationToken) {
        await $package.updateDependencies(this.dowdep, async () => {
            if (cancellationToken?.isCancellationRequested) {
                throw new vscode.CancellationError()
            }
            this.notifyModelObservers()
        })
    }

    async refreshReferences(dependency: Dependency, cancellationToken?: vscode.CancellationToken) {
        await dependency.updateReferences(this.dowdep, async () => {
            if (cancellationToken?.isCancellationRequested) {
                throw new vscode.CancellationError()
            }
            this.notifyModelObservers()
        })
    }

    private wrapWithLogger<TIn extends any[], TOut>(fun: (...args: TIn) => Promise<TOut>) {
        return async (...args: TIn) => {
            try {
                return await fun(...args)
            } catch (error) {
                console.error(error)
                throw error
            }
        }
    }

    private notifyModelObservers() {
        this.dependenciesProvider.updateModel()
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
