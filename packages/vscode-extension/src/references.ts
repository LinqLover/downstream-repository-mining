import assert from 'assert'
import { DeclarationLocation, Dependency, Package, Reference } from 'dowdep'
import _ from 'lodash'
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
        registerCallback('dowdep.dowdepReferences.openPackageMemberNode', (item: PackageMemberNodeItem) => item.open())
        registerCallback('dowdep.dowdepReferences.openDependency', (item: ReferencesDependencyItem) => item.open())
    }

    register() {
        this.basicRegister('dowdepReferences')
        return this
    }

    revealPackageMemberItem($package: Package, location: DeclarationLocation) {
        const item = this.findPackageMemberItem($package, location)
        if (!item) {
            return
        }
        this.treeView?.reveal(item, {
            focus: true,
            expand: true
        })
    }

    private findPackageMemberItem($package: Package, location: DeclarationLocation) {
        return this.findPackageItem($package)?.findPackageMemberItem(location)
    }

    private findPackageItem($package: Package) {
        return this.findItem<ReferencesPackageItem>(item =>
            item instanceof ReferencesPackageItem
                && item.$package === $package)
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

    public findPackageMemberItem(location: DeclarationLocation): PackageMemberNodeItem | undefined {
        return this.findItem(item =>
            item instanceof PackageMemberNodeItem
                && item.getDeclarationLocation() === location)
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

    // Sort items by type (complex items first)
    protected pathSegmentSorters = [
        (pathSegment: string) =>
            pathSegment !== PackageFileNodeItem.leafPathSegment,
        (pathSegmentOrLeaf: string | Dependency | Reference) => pathSegmentOrLeaf
    ]

    protected get $package() {
        const anyReference = this.allLeafs[0]
        return anyReference.dependency.$package
    }

    protected getFullPath(reference: Reference) {
        assert(reference.dependency.$package.directory)
        const baseUri = vscode.Uri.parse(reference.dependency.$package.directory)
        const fileUri = vscode.Uri.joinPath(baseUri, reference.declarationLocation().file)
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
            'dowdep.openPackageFileOrFolder',
            this.$package,
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

        this.command = {
            title: "Browse member",
            command: 'dowdep.dowdepReferences.openPackageMemberNode',
            arguments: [this]
        }
    }

    public get $package() {
        const anyReference = this.allLeafs[0]
        return anyReference.dependency.$package
    }

    public getDeclarationLocation() {
        for (const reference of this.allLeafs) {
            if (reference.declaration instanceof DeclarationLocation
                && _.isEqual(reference.declaration.memberPath, this.path)
            ) {
                return reference.declarationLocation()
            }
        }
    }

    getPath(reference: Reference) {
        return reference.declarationLocation().memberPath ?? []
    }

    // Sort items by type (complex items first)
    protected pathSegmentSorters = [
        (pathSegmentOrLeaf: string | Dependency | Reference) =>
            [
                _.isString,
                (obj: string | Dependency | Reference) => obj instanceof Dependency
            ].findIndex(predicate =>
                predicate(pathSegmentOrLeaf)) + 1 || Infinity,
        (pathSegmentOrLeaf: string | Dependency | Reference) => pathSegmentOrLeaf
    ]

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

    async open() {
        const location = this.getDeclarationLocation()
        if (!location) {
            return
        }

        await vscode.commands.executeCommand(
            'dowdep.openPackageMember',
            this.$package,
            location
        )
    }
}

class ReferencesDependencyItem extends DependencyItem<ReferencesDependencyItem, ReferenceItem> {
    get dependency() {
        const anyReference = this.allLeafs[0]
        return anyReference.dependency
    }

    // Sort items by position in file
    protected leafSorters = [
        (reference: Reference) => reference.location.position.row,
        (reference: Reference) => reference.location.position.column,
    ]

    createItemChild(pathSegmentOrLeaf: undefined | Reference) {
        assert(pathSegmentOrLeaf instanceof Reference)
        return new ReferenceItem(pathSegmentOrLeaf)
    }
}
