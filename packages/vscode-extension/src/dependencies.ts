import { strict as assert } from 'assert'
import { Dependency, Package, Reference } from 'dowdep'
import * as vscode from 'vscode'

import { Extension } from './extension'
import { HierarchyNodeItem, LabeledHierarchyNodeItem, RefreshableHierarchyItem } from './utils/vscode/hierarchy'
import { DependencyItem, HierarchyProvider, PackageItem, PackagesItem, ReferenceFileNodeItem, ReferenceItem } from './views'


export class DependenciesProvider extends HierarchyProvider<DependenciesPackagesItem> {
    constructor(
        extension: Extension
    ) {
        super(new DependenciesPackagesItem(extension))
    }

    static createCommands(
        registerCallback: (commandName: string,
            commandCallback: (...args: any[]) => Promise<void>) => void
    ) {
        registerCallback('dowdep.dowdepDependencies.openPackage', (item: DependenciesPackageItem) => item.open())
        registerCallback('dowdep.dowdepDependencies.refreshDependencies', (item: DependenciesPackageItem) => item.refreshDependencies())
        registerCallback('dowdep.dowdepDependencies.openDependency', (item: DependenciesDependencyItem) => item.open())
        registerCallback('dowdep.dowdepDependencies.refreshReferences', (item: DependenciesDependencyItem) => item.refreshReferences())
        registerCallback('dowdep.dowdepDependencies.openDependencyFileNode', (item: DependencyFileNodeItem) => item.open())
    }

    register() {
        this.basicRegister('dowdepDependencies')
        return this
    }
}

class DependenciesPackagesItem extends PackagesItem<DependenciesPackageItem> {
    createItemChild($package: Package) {
        return new DependenciesPackageItem($package, this)
    }
}

class DependenciesPackageItem extends PackageItem<DependenciesDependencyItem> {
    protected getChildrenKeys() {
        return this.$package.dependencies
    }

    createItemChild(dependency: Dependency) {
        return new DependenciesDependencyItem(dependency, this)
    }

    refresh() {
        super.refresh()

        this.description = HierarchyNodeItem.makeDescriptionForCount(this.$package.allReferences)
    }

    async refreshDependencies() {
        await vscode.commands.executeCommand('dowdep.refreshDependencies', this.$package)
    }
}

/** Forwards generation of children to a {@link DependencyFileNodeItem} instance. */
class DependenciesDependencyItem extends DependencyItem<
    DependenciesDependencyItem,
    DependencyFileNodeItem | DependencyMemberNodeItem | ReferenceItem
> {
    constructor(
        protected dependency: Dependency,
        parent: RefreshableHierarchyItem
    ) {
        super(parent)
    }

    private dependencyNodeItem = new DependencyFileNodeItem([], this)

    getChildren() {
        return this.dependencyNodeItem.getChildren()
    }

    refresh() {
        super.refresh()
        this.label = this.dependency.name

        this.dependencyNodeItem.allLeafs = this.dependency.references
        this.dependencyNodeItem.refresh()
        this.description = this.dependencyNodeItem.description
    }

    async refreshReferences() {
        await vscode.commands.executeCommand('dowdep.refreshReferences', this.dependency)
    }

    protected *getChildrenKeys(): Iterable<undefined | Reference> {
        return
    }

    protected createItemChild(_model: Reference | undefined): never {
        assert(false)
    }
}

class DependencyFileNodeItem extends ReferenceFileNodeItem<
    DependencyFileNodeItem,
    DependencyMemberNodeItem,
    ReferenceItem
> {
    constructor(
        public path: readonly string[],
        parent: RefreshableHierarchyItem
    ) {
        super(path, parent)

        this.command = {
            title: "Browse dependency folder",
            command: 'dowdep.dowdepDependencies.openDependencyFileNode',
            arguments: [this]
        }
    }

    get dependency() {
        const anyReference = this.allLeafs[0]
        return anyReference.dependency
    }

    protected getFullPath(reference: Reference) {
        const baseUri = vscode.Uri.parse(reference.dependency.sourceDirectory!)
        const fileUri = vscode.Uri.joinPath(baseUri, reference.location.file)
        return { baseUri, fileUri }
    }

    createMemberNodeChild() {
        return new DependencyMemberNodeItem([], this)
    }

    createFileNodeChild(path: readonly string[]) {
        return new DependencyFileNodeItem(path, this)
    }

    isComplexItem(child: DependencyFileNodeItem | DependencyMemberNodeItem | ReferenceItem): child is DependencyFileNodeItem {
        return child instanceof DependencyFileNodeItem
    }

    async open() {
        await vscode.commands.executeCommand(
            'dowdep.openDependencyFolder',
            this.dependency,
            this.path.join('/')
        )
    }
}

class DependencyMemberNodeItem extends LabeledHierarchyNodeItem<
    Reference,
    DependencyMemberNodeItem,
    ReferenceItem
> {
    constructor(path: readonly string[], parent: RefreshableHierarchyItem) {
        super(path, parent, {
            showCountInDescription: true
        })
    }

    // Sort items by position in file
    protected leafSorters = [
        (reference: Reference) => reference.location.position.row,
        (reference: Reference) => reference.location.position.column,
    ]

    getPath(reference: Reference) {
        return reference.location.memberPath ?? []
    }

    createItemChild(pathSegmentOrLeaf: string | Reference) {
        if (pathSegmentOrLeaf instanceof Reference) {
            return new ReferenceItem(pathSegmentOrLeaf, this)
        }

        return new DependencyMemberNodeItem([...this.path, pathSegmentOrLeaf], this)
    }

    isComplexItem(child: DependencyMemberNodeItem | ReferenceItem): child is DependencyMemberNodeItem {
        return child instanceof DependencyMemberNodeItem
    }
}
