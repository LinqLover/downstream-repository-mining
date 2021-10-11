import { strict as assert } from 'assert'
import { Dependency, Package, Reference } from 'dowdep'
import _ from 'lodash'
import truncate from 'truncate'
import * as vscode from 'vscode'

import { Extension } from './extension'
import { HierarchyDataProvider, HierarchyItem, HierarchyNodeItem, LabeledHierarchyNodeItem, RefreshableHierarchyItem, SynchronizableHierarchyItem } from './utils/vscode/hierarchy'
import * as iterUtils from './utils/node/iterUtils'
import { md } from './utils/vscode/markdown'
import isDefined from './utils/node/isDefined'


export class HierarchyProvider<TRootItem extends RefreshableHierarchyItem> extends HierarchyDataProvider<TRootItem> {
    static createCommands(
        registerCallback: (commandName: string,
            commandCallback: (...args: any[]) => Promise<void>) => void
    ) {
        registerCallback('dowdep.dowdepDependencies.openRandomReference', (item: HierarchyItem) => this.openRandomReference(item))
        registerCallback('dowdep.dowdepDependencies.openDependencyExternally', (item: DependencyItem<any, any>) => item.openExternally())
        registerCallback('dowdep.dowdepReferences.openReference', (item: ReferenceItem) => item.open())
    }

    protected static async openRandomReference(root: HierarchyItem) {
        const item = _.sample([...root.findAllLeafs(<(item: HierarchyItem) => item is ReferenceItem>(_item => _item instanceof ReferenceItem))])
        return await item?.open()
    }
}

export abstract class PackagesItem<TPackageItem extends RefreshableHierarchyItem> extends SynchronizableHierarchyItem<Package, TPackageItem> {
    constructor(
        protected extension: Extension
    ) {
        super(null, vscode.TreeItemCollapsibleState.Expanded)
    }

    public parent = null

    getChildrenKeys() {
        return this.extension.packages
    }
}

export abstract class PackageItem<TItem extends RefreshableHierarchyItem> extends SynchronizableHierarchyItem<Dependency, TItem> {
    constructor(
        public $package: Package,
        parent: RefreshableHierarchyItem
    ) {
        super(parent, vscode.TreeItemCollapsibleState.Expanded)

        this.typeContext = 'package'
        this.command = {
            title: "Reveal in explorer",
            command: 'dowdep.dowdepDependencies.openPackage',
            arguments: [this]
        }
        this.iconPath = new vscode.ThemeIcon('symbol-reference')
    }

    refresh() {
        this.label = this.$package.name

        super.refresh()
    }

    async open() {
        await vscode.commands.executeCommand('dowdep.openPackage', this.$package)
    }
}

export abstract class DependencyItem<
    TDependencyItem extends DependencyItem<TDependencyItem, TReferenceItem>,
    TReferenceItem extends RefreshableHierarchyItem
> extends HierarchyNodeItem<undefined, Reference, TDependencyItem, TReferenceItem> {
    constructor(parent: RefreshableHierarchyItem) {
        super([], parent, {
            showCountInDescription: true
        })

        this.typeContext = 'dependency'
        this.command = {
            title: "Browse dependency",
            command: 'dowdep.dowdepReferences.openDependency',
            arguments: [this]
        }
    }

    private static maximumDescriptionLength: 400
    protected abstract get dependency(): Dependency

    refresh() {
        super.refresh()

        this.tooltip = this.buildTooltip()
        this.iconPath = new vscode.ThemeIcon('package')
    }

    getPath(_reference: Reference) {
        return []
    }

    isComplexItem(child: TDependencyItem | TReferenceItem): child is TDependencyItem {
        return child instanceof DependencyItem
    }

    isPathSegment(pathSegmentOrLeaf: undefined | Reference): pathSegmentOrLeaf is undefined {
        return !isDefined(pathSegmentOrLeaf)
    }

    labelFromPathSegment(pathSegmentOrLeaf: undefined | Reference): string {
        assert(this.isPathSegment(pathSegmentOrLeaf))
        return this.dependency.name
    }

    async open() {
        // TODO: Do not suppress expansion of item on click - expand it manually
        await vscode.commands.executeCommand('dowdep.openDependency', this.dependency)
    }

    async openExternally() {
        await vscode.commands.executeCommand('dowdep.openDependencyExternally', this.dependency)
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
            yield md`${truncate(this.dependency.description, DependencyItem.maximumDescriptionLength)}`
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

export abstract class ReferenceFileNodeItem<
    TFileNodeItem extends ReferenceFileNodeItem<TFileNodeItem, TMemberNodeItem, TLeafItem>,
    TMemberNodeItem extends RefreshableHierarchyItem & {
        allLeafs: readonly Reference[],
        getChildren(): IterableIterator<TMemberNodeItem | TLeafItem>
    },
    TLeafItem extends RefreshableHierarchyItem
> extends LabeledHierarchyNodeItem<Reference, TFileNodeItem, TMemberNodeItem | TLeafItem> {
    constructor(path: readonly string[], parent: RefreshableHierarchyItem) {
        super(path, parent, {
            showCountInDescription: true
        })
    }

    /** Magic number to denote leaves, @see {@link getPathSegment}. */
    protected static readonly leafPathSegment = '//'

    get dependency() {
        const anyReference = this.allLeafs[0]
        return anyReference.dependency
    }

    protected getPathSegment(reference: Reference) {
        const pathSegment = super.getPathSegment(reference)
        // Make sure to collect all member node items into a single pseudo bucket to avoid unneccessary nesting.
        return pathSegment || ReferenceFileNodeItem.leafPathSegment
    }

    protected abstract getFullPath(reference: Reference): {
        baseUri: vscode.Uri,
        fileUri: vscode.Uri
    }

    protected getPath(reference: Reference) {
        const { fileUri, baseUri } = this.getFullPath(reference)
        return fileUri.path.split('/').slice(baseUri.path.split('/').length)
    }

    protected createItemChild(pathSegmentOrLeaf: string | Reference): TFileNodeItem | TMemberNodeItem {
        assert(!(pathSegmentOrLeaf instanceof Reference))

        return pathSegmentOrLeaf === ReferenceFileNodeItem.leafPathSegment
            ? this.createMemberNodeChild()
            : this.createFileNodeChild([...this.path, pathSegmentOrLeaf])
    }

    protected abstract createMemberNodeChild(): TMemberNodeItem
    protected abstract createFileNodeChild(path: readonly string[]): TFileNodeItem

    refresh() {
        super.refresh()

        this.iconPath = new vscode.ThemeIcon(this.hasComplexChildren ? 'symbol-folder' : 'symbol-file')
    }

    refreshChildItem(child: TFileNodeItem | TMemberNodeItem, pathSegmentOrLeaf: string | Reference) {
        if (!this.isComplexItem(child)) {
            assert(this.isPathSegment(pathSegmentOrLeaf))
            const leafs = this.getLeafsForPathSegment(pathSegmentOrLeaf)
            assert(leafs)
            child.allLeafs = leafs
        }

        super.refreshChildItem(child, pathSegmentOrLeaf)
    }

    *getChildren() {
        yield* iterUtils.flatMap<TFileNodeItem | TMemberNodeItem, TFileNodeItem | TMemberNodeItem | TLeafItem>(
            /** Not any child item will ever be a leaf, @see {@link getPathSegment}. */
            <IterableIterator<TFileNodeItem | TMemberNodeItem>>super.getChildren(),
            item => this.isComplexItem(item)
                ? item
                : <IterableIterator<TMemberNodeItem | TLeafItem>>(<TMemberNodeItem>item).getChildren()
        )
    }
}

export class ReferenceItem extends RefreshableHierarchyItem {
    constructor(
        protected reference: Reference,
        parent: RefreshableHierarchyItem
    ) {
        super(parent)

        this.command = {
            title: "Jump to reference",
            command: 'dowdep.dowdepReferences.openReference',
            arguments: [this]
        }
        this.typeContext = 'reference'
    }

    *getChildren() {
        // Leaf.
    }

    refresh() {
        this.label = this.reference.matchString
        this.tooltip = this.reference.declarationLocation().memberName
        // TODO: Provide more source code context in tooltip
    }

    async open() {
        await vscode.commands.executeCommand('dowdep.openReference', this.reference)
    }
}
