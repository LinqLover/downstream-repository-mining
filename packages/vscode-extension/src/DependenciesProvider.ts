import asyncIteratorToArray from 'it-all'
import * as vscode from 'vscode'

import { Dependent, Package } from 'dowdep'

export class DependenciesProvider implements vscode.TreeDataProvider<DependencyItem> {
    constructor(
        protected workspaceFolders?: readonly vscode.WorkspaceFolder[]
    ) { }

    getTreeItem(item: DependencyItem) {
        return item
    }

    async getChildren(item?: DependencyItem) {
        if (!this.workspaceFolders?.length) {
            vscode.window.showInformationMessage("No package found")
            return []
        }

        if (!item) {
            return asyncIteratorToArray(this.getRoots())
        }
        return asyncIteratorToArray(item.getChildren(this))
    }

    async* getRoots() {
        for (const folder of this.workspaceFolders!) {
            let $package: DependencyPackage
            try {
                $package = await DependencyPackage.fromWorkspaceFolder(folder)
                console.log("Package found", { $package })
            } catch {
                continue
            }
            yield $package
        }
    }
}

// TODO: Icons
abstract class DependencyItem extends vscode.TreeItem {
    abstract getChildren(provider: DependenciesProvider): AsyncGenerator<DependencyItem, void, unknown>
}

class DependencyPackage extends DependencyItem {
    constructor(
        protected $package: Package,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super($package.name, collapsibleState)
    }

    public static async fromWorkspaceFolder(workspaceFolder: vscode.WorkspaceFolder) {
        const packageJsonUri = vscode.Uri.joinPath(workspaceFolder.uri, 'package.json')
        const packageJson = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(packageJsonUri)).toString('utf-8'))
        // TODO: Move into core package and use normalize-package-data (i.e., pass object)
        const $package = new Package({
            name: <string>packageJson.name,
            directory: packageJsonUri.path
        })
        return new DependencyPackage($package, vscode.TreeItemCollapsibleState.Expanded)
    }

    async* getChildren() {
        for await (const dependent of this.$package.findDependents(20)) {
            yield await DependencyProject.fromDependent(dependent)
        }
    }
}

class DependencyProject extends DependencyItem {
    constructor(
        protected dependent: Dependent,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(dependent.name, collapsibleState)
    }

    public static async fromDependent(dependent: Dependent) {
        return new DependencyProject(dependent, vscode.TreeItemCollapsibleState.None)
    }

    async* getChildren() {
        return
    }
}
