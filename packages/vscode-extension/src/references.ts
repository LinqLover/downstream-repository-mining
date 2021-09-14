import assert from 'assert'
import { Dependency, Package, Reference } from 'dowdep'
import * as vscode from 'vscode'

import { Extension } from './extension'
import { HierarchyNodeItem } from './utils/vscode/hierarchy'
import { DependencyItem, HierarchyProvider, PackageItem, PackagesItem, ReferenceFileNodeItem, ReferenceItem } from './views'


export class ReferencesProvider extends HierarchyProvider<ReferencesPackagesItem> {
    constructor(
        extension: Extension
    ) {
        super(new ReferencesPackagesItem(extension))
    }

    static createCommands(
        registerCallback: (commandName: string,
            commandCallback: (...args: any[]) => Promise<void>) => void
    ) {
        registerCallback('dowdep.dowdepReferences.openPackage', (item: ReferencesPackageItem) => item.open())
        registerCallback('dowdep.dowdepReferences.openPackageFileNode', (item: PackageFileNodeItem) => item.open())
        registerCallback('dowdep.dowdepReferences.openDependency', (item: ReferencesDependencyItem) => item.open())
    }
}

class ReferencesPackagesItem extends PackagesItem<ReferencesPackageItem> {
    createItemChild($package: Package) {
        return new ReferencesPackageItem($package)
    }
}

/** Forwards generation of children to a {@link PackageFileNodeItem} instance. */
class ReferencesPackageItem extends PackageItem<
    PackageFileNodeItem | PackageMemberNodeItem | ReferencesDependencyItem
> {
    private packageNodeItem = new PackageFileNodeItem([])

    getChildren() {
        return this.packageNodeItem.getChildren()
    }

    refresh() {
        super.refresh()
        this.packageNodeItem.allLeafs = this.$package.allReferences
        this.packageNodeItem.refresh()

        this.description = this.packageNodeItem.description
    }

    protected *getChildrenKeys(): Iterable<Dependency> {
        return
    }

    protected createItemChild(_model: Dependency): never {
        assert(false)
    }
}

class PackageFileNodeItem extends ReferenceFileNodeItem<
    PackageFileNodeItem,
    PackageMemberNodeItem,
    ReferencesDependencyItem
> {
    constructor(
        public path: ReadonlyArray<string>
    ) {
        super(path)

        this.command = {
            title: "Browse folder",
            command: 'dowdep.dowdepReferences.openPackageFileNode',
            arguments: [this]
        }
    }

    protected pathSegmentSorters = []

    protected get reference() {
        return this.allLeafs[0]
    }

    protected getFullPath(reference: Reference) {
        assert(reference.dependency.$package.directory)
        const baseUri = vscode.Uri.parse(reference.dependency.$package.directory)
        const fileUri = vscode.Uri.joinPath(baseUri, reference.declarationFile!)
        return { baseUri, fileUri }
    }

    createMemberNodeChild() {
        return new PackageMemberNodeItem([])
    }

    createFileNodeChild(path: ReadonlyArray<string>) {
        return new PackageFileNodeItem(path)
    }

    isComplexItem(child: PackageFileNodeItem | PackageMemberNodeItem | ReferencesDependencyItem): child is PackageFileNodeItem {
        return child instanceof PackageFileNodeItem
    }

    async open() {
        await vscode.commands.executeCommand(
            'dowdep.openReferenceFileOrFolder',
            this.reference,
            this.path.join('/')
        )
    }
}

class PackageMemberNodeItem extends HierarchyNodeItem<
    string | Dependency,
    Reference,
    PackageMemberNodeItem,
    ReferencesDependencyItem
> {
    constructor(
        path: ReadonlyArray<string | Dependency>
    ) {
        super(path, {
            showCountInDescription: true
        })
    }

    getPath(reference: Reference) {
        return reference.declarationMemberPath ?? []
    }

    protected pathSegmentSorters = []  // Sort members alphabetically.
    protected getPathSegment(reference: Reference) {
        const pathSegment = super.getPathSegment(reference)
        return pathSegment || reference.dependency
    }

    createItemChild(pathSegmentOrLeaf: string | Dependency | Reference) {
        assert(!(pathSegmentOrLeaf instanceof Reference))

        return pathSegmentOrLeaf instanceof Dependency
            ? new ReferencesDependencyItem()
            : new PackageMemberNodeItem([...this.path, pathSegmentOrLeaf])
    }

    refreshChildItem(child: PackageMemberNodeItem | ReferencesDependencyItem, pathSegmentOrLeaf: string | Dependency | Reference) {
        if (!this.isComplexItem(child)) {
            assert(this.isPathSegment(pathSegmentOrLeaf))
            const leafs = this.getLeafsForPathSegment(pathSegmentOrLeaf)
            assert(leafs)
            child.allLeafs = leafs
        }

        super.refreshChildItem(child, pathSegmentOrLeaf)
    }

    isComplexItem(child: PackageMemberNodeItem | ReferencesDependencyItem): child is PackageMemberNodeItem {
        return child instanceof PackageMemberNodeItem
    }

    isPathSegment(pathSegmentOrLeaf: string | Dependency | Reference): pathSegmentOrLeaf is string | Dependency {
        return !(pathSegmentOrLeaf instanceof Reference)
    }

    labelFromPathSegment(pathSegment: string | Dependency): string {
        assert(!(pathSegment instanceof Dependency))
        return pathSegment
    }
}

class ReferencesDependencyItem extends DependencyItem<ReferencesDependencyItem, ReferenceItem> {
    get dependency() {
        const anyReference = this.allLeafs[0]
        return anyReference.dependency
    }

    createItemChild(pathSegmentOrLeaf: undefined | Reference) {
        assert(pathSegmentOrLeaf instanceof Reference)
        return new ReferenceItem(pathSegmentOrLeaf)
    }
}
