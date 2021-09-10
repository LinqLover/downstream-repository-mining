import assert from 'assert'
import _ from 'lodash'
import * as vscode from 'vscode'

import { Extension } from './extension'
import { Dependency, Package, Reference } from 'dowdep'

import * as iterUtils from './utils/iterUtils'
import * as mapUtils from './utils/mapUtils'
import md from './utils/markdown'

export class DependenciesProvider implements vscode.TreeDataProvider<HierarchicalTreeItem> {
    constructor(
        extension: Extension
    ) {
        this.rootItem = new PackagesItem(extension)
    }

    static createCommands(
        registerCallback: (commandName: string,
            commandCallback: (...args: any[]) => Promise<void>) => void
    ) {
        registerCallback('dowdep.dowdepDependencies.openPackage', (item: PackageItem) => item.open())
        registerCallback('dowdep.dowdepDependencies.openDependency', (item: DependencyItem) => item.open())
        registerCallback('dowdep.dowdepDependencies.openDependencyFileNode', (item: DependencyFileNodeItem) => item.open())
        registerCallback('dowdep.dowdepDependencies.openReference', (item: ReferenceItem) => item.open())
    }

    private rootItem: PackagesItem

    private _onDidChangeTreeData: vscode.EventEmitter<HierarchicalTreeItem | undefined | null | void>
        = new vscode.EventEmitter<HierarchicalTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<HierarchicalTreeItem | undefined | null | void>
        = this._onDidChangeTreeData.event;

    getChildren(item?: HierarchicalTreeItem) {
        return [...!item ? this.getRoots() : item.getChildren()]
    }

    getTreeItem(item: HierarchicalTreeItem) {
        return item
    }

    updateModel() {
        this.refresh()
    }

    protected getRoots() {
        return this.rootItem.getChildren()
    }

    protected refresh(): void {
        this.rootItem.refresh()
        this._onDidChangeTreeData.fire()
    }
}

abstract class HierarchicalTreeItem extends vscode.TreeItem {
    abstract getChildren(): IterableIterator<HierarchicalTreeItem>
}

abstract class RefreshableHierarchicalTreeItem extends HierarchicalTreeItem {
    abstract refresh(): void
}

abstract class SynchronizableHierarchicalTreeItem<
    TModel,
    TItem extends RefreshableHierarchicalTreeItem
> extends RefreshableHierarchicalTreeItem {
    constructor(
        label: string | vscode.TreeItemLabel,
        collapsibleState?: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState)
        this.children = new Map<TModel, TItem>()
    }

    private children: Map<TModel, TItem>

    getChildren() {
        return this.children.values()
    }

    protected get basicModelChildren() {
        return this.children.keys()
    }

    protected get basicItemChildren() {
        return this.children.values()
    }

    refresh() {
        const oldChildren = this.children
        this.children = new Map(
            [...this.getModelChildren()].map(model => {
                const child = oldChildren.get(model) ?? this.createItemChild(model)
                this.refreshItemChild(child, model)
                return [model, child]
            })
        )
    }

    protected refreshItemChild(child: TItem, _model: TModel) {
        child.refresh()
    }

    protected abstract getModelChildren(): Iterable<TModel>

    protected abstract createItemChild(model: TModel): TItem
}

// TODO: Icons
abstract class DependenciesItem<
    TModel,
    TItem extends RefreshableHierarchicalTreeItem
> extends SynchronizableHierarchicalTreeItem<TModel, TItem> {

}

class PackagesItem extends DependenciesItem<Package, PackageItem> {
    constructor(
        protected extension: Extension
    ) {
        super(
            "",
            vscode.TreeItemCollapsibleState.Expanded
        )
    }

    getModelChildren() {
        return this.extension.packages
    }

    createItemChild($package: Package) {
        return new PackageItem($package)
    }
}

class PackageItem extends DependenciesItem<Dependency, DependencyItem> {
    constructor(
        public $package: Package
    ) {
        super(
            "",
            vscode.TreeItemCollapsibleState.Expanded
        )

        this.command = {
            title: "Reveal in explorer",
            command: 'dowdep.dowdepDependencies.openPackage',
            arguments: [this]
        }
        this.iconPath = new vscode.ThemeIcon('package')
    }

    getModelChildren() {
        return this.$package.dependencies
    }

    createItemChild(dependency: Dependency) {
        return new DependencyItem(dependency)
    }

    refresh() {
        this.label = this.$package.name

        super.refresh()
    }

    async open() {
        await vscode.commands.executeCommand('dowdep.openPackage', this.$package)
    }
}

class DependencyItem extends HierarchicalTreeItem {
    constructor(
        protected dependency: Dependency
    ) {
        super(
            "",
            vscode.TreeItemCollapsibleState.Collapsed
        )

        this.dependencyNodeItem = new DependencyFileNodeItem([])

        this.command = {
            title: "Browse dependency",
            command: 'dowdep.dowdepDependencies.openDependency',
            arguments: [this]
        }
    }
    dependencyNodeItem: DependencyFileNodeItem

    getChildren() {
        return this.dependencyNodeItem.getChildren()
    }

    refresh() {
        this.label = this.dependency.name
        this.tooltip = this.buildTooltip()
        this.description = `(${Intl.NumberFormat('en', {notation: 'compact'}).format(this.dependency.references.length)})`

        this.dependencyNodeItem.allLeafs = this.dependency.references
        this.dependencyNodeItem.refresh()
    }

    async open() {
        // TODO: Do not suppress expansion of item on click - expand it manually
        await vscode.commands.executeCommand('dowdep.openDependency', this.dependency)
    }

    protected buildTooltip() {
        const total = new vscode.MarkdownString('', true)
        total.isTrusted = true
        for (const part of this.printTooltipLines()) {
            if (part) {
                total.appendMarkdown(part.value)
            }
            total.appendMarkdown('\n')
        }
        return total
    }

    protected *printTooltipLines() {
        yield md`**${this.dependency.name}**`
        if (this.dependency.description) {
            yield
            yield md`${this.dependency.description}` // TODO: truncate if longer than x
        }

        if (this.dependency.urls.size) {
            yield
            yield md`View online: ${new vscode.MarkdownString(
                Array.from(this.dependency.urls, ([label, url]) =>
                    md`[${label}](${new vscode.MarkdownString(url)})`.value).join(" ⸱ ")
            )}`
        }

        if (this.dependency.githubRepository && this.dependency.githubRepository.stargazerCount && this.dependency.githubRepository.forkCount) {
            yield
            yield md`---`
            yield
            yield md`GitHub: ${
                [
                    ["stars", this.dependency.githubRepository.stargazerCount],
                    ["forks", this.dependency.githubRepository.forkCount]
                ].map(([label, count]) => md`${count} ${label}`.value).join(" ⸱ ")
            }`
        }
    }
}

/* class DependencyNodeItem extends DependenciesItem<string | Reference, DependencyNodeItem | ReferenceItem> {
    constructor(
        public readonly path: string[]
    ) {
        super(
            _.last(path) ?? "",
            vscode.TreeItemCollapsibleState.Collapsed
        )

        this.nestedBuckets = new Map<string, Reference[]>()
    }

    public allReferences: ReadonlyArray<Reference> = []
    private nestedBuckets: Map<string, Reference[]>

    *getModelChildren() {
        this.nestedBuckets.clear()
        const leafs: Reference[] = []
        for (const reference of this.allReferences) {
            const baseUri = vscode.Uri.parse(reference.dependency.sourceDirectory!)
            const fileUri = vscode.Uri.joinPath(baseUri, reference.file)
            const pathSegment = (
                // reference.memberPath
                fileUri.path.split('/').slice(baseUri.path.split('/').length)
            )[this.path.length]
            const bucket = pathSegment
                ? mapUtils.getOrSet(this.nestedBuckets, pathSegment, () => [])
                : leafs
            bucket.push(reference)
        }

        yield* this.nestedBuckets.keys()
        yield* leafs
    }

    createItemChild(pathSegment: string): DependencyNodeItem
    createItemChild(reference: Reference): ReferenceItem
    createItemChild(pathSegmentOrReference: string | Reference) {
        if (pathSegmentOrReference instanceof Reference) {
            return new ReferenceItem(pathSegmentOrReference)
        }

        return new DependencyNodeItem([...this.path, pathSegmentOrReference])
    }

    refreshItemChild(child: DependencyNodeItem, pathSegmentOrReference: string): void
    refreshItemChild(child: ReferenceItem, pathSegmentOrReference: Reference): void
    refreshItemChild(child: DependencyNodeItem | ReferenceItem, pathSegmentOrReference: string | Reference) {
        if (child instanceof DependencyNodeItem) {
            assert(_.isString(pathSegmentOrReference))
            const references = this.nestedBuckets.get(pathSegmentOrReference)
            assert(references)
            child.allReferences = references
        }

        super.refreshItemChild(child, pathSegmentOrReference)
    }
} */

abstract class HierarchicalNodeItem<
    TPathSegment,
    TLeafModel,
    TComplexItem extends HierarchicalNodeItem<TPathSegment, TLeafModel, TComplexItem, TLeafItem>,
    TLeafItem extends RefreshableHierarchicalTreeItem
> extends SynchronizableHierarchicalTreeItem<TPathSegment | TLeafModel, TComplexItem | TLeafItem> {
    constructor(
        public path: TPathSegment[]
    ) {
        super(
            "",
            vscode.TreeItemCollapsibleState.Collapsed
        )

        this.nestedBuckets = new Map<TPathSegment, TLeafModel[]>()
    }

    public allLeafs: ReadonlyArray<TLeafModel> = []
    private nestedBuckets: Map<TPathSegment, TLeafModel[]>

    *getModelChildren() {
        this.nestedBuckets.clear()
        const leafs: TLeafModel[] = []
        for (const leaf of this.allLeafs) {
            const pathSegment = this.getPathSegment(leaf)
            const bucket = pathSegment
                ? mapUtils.getOrSet(this.nestedBuckets, pathSegment, () => [])
                : leafs
            bucket.push(leaf)
        }

        yield* this.nestedBuckets.keys()
        yield* leafs
    }

    protected getPathSegment(leaf: TLeafModel) {
        return this.getPath(leaf)[this.path.length]
    }

    protected abstract getPath(leaf: TLeafModel): TPathSegment[]

    protected get hasComplexChildren() {
        return iterUtils.some(this.basicItemChildren, item => this.isComplexItem(item))
    }

    //protected abstract createItemChild(pathSegment: TPathSegment): TComplexItem
    //protected abstract createItemChild(leaf: TLeafModel): TLeafItem
    //protected abstract createItemChild(pathSegmentOrLeaf: TLeafModel | TLeafModel): TComplexItem | TLeafItem

    refresh() {
        this.label = this.labelFromPathSegment(_.last(this.path))

        super.refresh()
    }

    refreshItemChild(child: TComplexItem | TLeafItem, pathSegmentOrLeaf: TPathSegment | TLeafModel) {
        if (this.isComplexItem(child)) {
            assert(this.isPathSegment(pathSegmentOrLeaf))
            const leafs = this.getLeafsForPathSegment(pathSegmentOrLeaf)
            assert(leafs)
            child.allLeafs = leafs
        }

        super.refreshItemChild(child, pathSegmentOrLeaf)
    }

    protected getLeafsForPathSegment(pathSegmentOrLeaf: TPathSegment) {
        return this.nestedBuckets.get(pathSegmentOrLeaf)
    }

    protected abstract isComplexItem(child: TComplexItem | TLeafItem): child is TComplexItem
    protected abstract isPathSegment(pathSegmentOrLeaf: TPathSegment | TLeafModel): pathSegmentOrLeaf is TPathSegment

    protected abstract labelFromPathSegment(pathSegment?: TPathSegment): string | vscode.TreeItemLabel
}

abstract class LabeledHierarchicalNodeItem<
    TLeafModel,
    TComplexItem extends LabeledHierarchicalNodeItem<TLeafModel, TComplexItem, TLeafItem>,
    TLeafItem extends RefreshableHierarchicalTreeItem
> extends HierarchicalNodeItem<string, TLeafModel, TComplexItem, TLeafItem> {
    isPathSegment(pathSegmentOrLeaf: string | TLeafModel): pathSegmentOrLeaf is string {
        return _.isString(pathSegmentOrLeaf)
    }

    labelFromPathSegment(pathSegment: string) {
        return pathSegment
    }
}

class DependencyFileNodeItem extends LabeledHierarchicalNodeItem<Reference, DependencyFileNodeItem, DependencyMemberNodeItem | ReferenceItem> {
    constructor(
        public path: string[]
    ) {
        super(path)

        this.command = {
            title: "Browse dependency folder",
            command: 'dowdep.dowdepDependencies.openDependencyFileNode',
            arguments: [this]
        }
    }

    protected getPathSegment(reference: Reference) {
        const pathSegment = super.getPathSegment(reference)
        return pathSegment || '//'
    }

    getFullPath(reference: Reference) {
        const baseUri = vscode.Uri.parse(reference.dependency.sourceDirectory!)
        const fileUri = vscode.Uri.joinPath(baseUri, reference.file)
        return { baseUri, fileUri }
    }

    getPath(reference: Reference) {
        const { fileUri, baseUri } = this.getFullPath(reference)
        return fileUri.path.split('/').slice(baseUri.path.split('/').length)
    }

    createItemChild(pathSegmentOrLeaf: string | Reference): DependencyFileNodeItem | DependencyMemberNodeItem {
        assert(!(pathSegmentOrLeaf instanceof Reference))

        if (pathSegmentOrLeaf === '//') {
            return new DependencyMemberNodeItem([])
        }

        return new DependencyFileNodeItem([...this.path, pathSegmentOrLeaf])
    }

    isComplexItem(child: DependencyFileNodeItem | DependencyMemberNodeItem | ReferenceItem): child is DependencyFileNodeItem {
        return child instanceof DependencyFileNodeItem
    }

    async open() {
        const anyReference = this.allLeafs[0]

        await vscode.commands.executeCommand('dowdep.openDependencyFolder', anyReference.dependency, this.path.join('/'))
    }

    refresh() {
        super.refresh()

        this.description = `(${Intl.NumberFormat('en', {notation: 'compact'}).format(this.allLeafs.length)})`
        this.iconPath = new vscode.ThemeIcon(this.hasComplexChildren ? 'symbol-folder' : 'symbol-file')
    }

    refreshItemChild(child: DependencyFileNodeItem | DependencyMemberNodeItem, pathSegmentOrLeaf: string | Reference) {
        if (!this.isComplexItem(child)) {
            assert(this.isPathSegment(pathSegmentOrLeaf))
            const leafs = this.getLeafsForPathSegment(pathSegmentOrLeaf)
            assert(leafs)
            child.allLeafs = leafs
        }

        super.refreshItemChild(child, pathSegmentOrLeaf)
    }

    *getChildren() {
        yield* iterUtils.flatMap<DependencyFileNodeItem | DependencyMemberNodeItem, DependencyFileNodeItem | DependencyMemberNodeItem | ReferenceItem>(
            <IterableIterator<DependencyFileNodeItem | DependencyMemberNodeItem>>super.getChildren(),
            item => this.isComplexItem(item) ? item : item.getChildren()
        )
    }
}

class DependencyMemberNodeItem extends LabeledHierarchicalNodeItem<Reference, DependencyMemberNodeItem, ReferenceItem> {
    getPath(reference: Reference) {
        return reference.memberPath ?? []
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

    refresh() {
        super.refresh()

        this.description = `(${Intl.NumberFormat('en', {notation: 'compact'}).format(this.allLeafs.length)})`
    }
}

class ReferenceItem extends RefreshableHierarchicalTreeItem {
    constructor(
        protected reference: Reference
    ) {
        super("")

        this.command = {
            title: "Jump to reference",
            command: 'dowdep.dowdepDependencies.openReference',
            arguments: [this]
        }
    }

    *getChildren() {
        return
    }

    refresh() {
        this.label = this.reference.matchString
        this.description = this.reference.position.toString()
        this.tooltip = this.reference.declarationMemberName ?? undefined
        // TODO: Provide more source code context in tooltip
    }

    async open() {
        await vscode.commands.executeCommand('dowdep.openReference', this.reference)
    }
}
