import { strict as assert } from 'assert'
import { Dependency, Package, Reference } from 'dowdep'
import * as vscode from 'vscode'

import { Extension } from './extension'
import { HierarchyNodeItem, LabeledHierarchyNodeItem } from './utils/vscode/hierarchy'
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
        registerCallback('dowdep.dowdepDependencies.openDependency', (item: DependenciesDependencyItem) => item.open())
        registerCallback('dowdep.dowdepDependencies.openDependencyFileNode', (item: DependencyFileNodeItem) => item.open())
    }

    register() {
        this.basicRegister('dowdepDependencies')
        return this
    }
}

class DependenciesPackagesItem extends PackagesItem<DependenciesPackageItem> {
    createItemChild($package: Package) {
        return new DependenciesPackageItem($package)
    }
}

class DependenciesPackageItem extends PackageItem<DependenciesDependencyItem> {
    protected getChildrenKeys() {
        return this.$package.dependencies
    }

    createItemChild(dependency: Dependency) {
        return new DependenciesDependencyItem(dependency)
    }

    refresh() {
        super.refresh()

        this.description = HierarchyNodeItem.makeDescriptionForCount(this.$package.allReferences)
    }
}

/** Forwards generation of children to a {@link DependencyFileNodeItem} instance. */
class DependenciesDependencyItem extends DependencyItem<
    DependenciesDependencyItem,
    DependencyFileNodeItem | DependencyMemberNodeItem | ReferenceItem
> {
    constructor(
        protected dependency: Dependency
    ) {
        super()
    }

    private dependencyNodeItem = new DependencyFileNodeItem([])

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
        public path: ReadonlyArray<string>
    ) {
        super(path)

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
        return new DependencyMemberNodeItem([])
    }

    createFileNodeChild(path: ReadonlyArray<string>) {
        return new DependencyFileNodeItem(path)
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
    constructor(path: ReadonlyArray<string>) {
        super(path, {
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
            return new ReferenceItem(pathSegmentOrLeaf)
        }

        return new DependencyMemberNodeItem([...this.path, pathSegmentOrLeaf])
    }

    isComplexItem(child: DependencyMemberNodeItem | ReferenceItem): child is DependencyMemberNodeItem {
        return child instanceof DependencyMemberNodeItem
    }
}
