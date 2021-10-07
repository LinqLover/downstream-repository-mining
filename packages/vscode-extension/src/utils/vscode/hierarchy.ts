import assert from 'assert'
import _ from 'lodash'
import * as vscode from 'vscode'

import * as iterUtils from '../node/iterUtils'
import * as mapUtils from '../node/mapUtils'
import { Synchronizer } from './synchronizer'


export abstract class HierarchyDataProvider<
    TRootItem extends RefreshableHierarchyItem
> implements vscode.TreeDataProvider<HierarchyItem> {
    protected constructor(
        private rootItem: TRootItem
    ) { }

    private _synchronizer = new Synchronizer(() => this.treeView?.visible ?? false)
    private _onDidChangeTreeData: vscode.EventEmitter<HierarchyItem | undefined | null | void>
        = new vscode.EventEmitter<HierarchyItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<HierarchyItem | undefined | null | void>
        = this._onDidChangeTreeData.event;
    protected treeView?: vscode.TreeView<HierarchyItem>

    getChildren(item?: HierarchyItem) {
        return [...!item ? this.getRoots() : item.getChildren()]
    }

    getTreeItem(item: HierarchyItem) {
        return item
    }


    getParent(childItem: HierarchyItem) {
        // This is NOT efficient!
        return this.findItem(item => iterUtils.includes(item.getChildren(), childItem))
    }

    protected getRoots = this._synchronizer.spy(
        () => this.basicGetRoots()
    )

    protected basicGetRoots() {
        return this.rootItem.getChildren()
    }

    public async modelChanged() {
        return await this.refresh()
    }

    protected refresh() {
        this.rootItem.refresh()

        return this._synchronizer.fire(this._onDidChangeTreeData)
    }

    private build(viewId: string) {
        return vscode.window.createTreeView(viewId, {
            treeDataProvider: this
        })
    }

    protected basicRegister(viewId: string) {
        this.treeView = this.build(viewId)
    }

    protected findItem<T extends HierarchyItem>(predicate: (item: HierarchyItem) => boolean) {
        for (const rootItem of this.basicGetRoots()) {
            const item = rootItem.findItem<T>(predicate)
            if (item) {
                return <T>item
            }
        }
    }
}

export abstract class HierarchyItem extends vscode.TreeItem {
    constructor(
        public parent: HierarchyItem | null,
        collapsibleState?: vscode.TreeItemCollapsibleState
    ) {
        super("", collapsibleState)
    }

    abstract getChildren(): IterableIterator<HierarchyItem>

    public *findAllItems(): Generator<HierarchyItem, void, unknown> {
        yield this
        for (const childItem of this.getChildren()) {
            yield* childItem.findAllItems()
        }
    }

    public findAllLeafs<T extends HierarchyItem>(predicate?: (item: HierarchyItem) => item is T)
    {
        return <Generator<T, void, unknown>>iterUtils.filter(this.findAllItems(), item =>
            item.isLeaf() && (!predicate || predicate(item)))
    }

    public findItem<T extends HierarchyItem>(predicate: (item: HierarchyItem) => boolean): T | undefined {
        return <T>iterUtils.find(this.findAllItems(), item => predicate(item))
    }

    public isLeaf() {
        return iterUtils.isEmpty(this.getChildren())
    }
}

export abstract class RefreshableHierarchyItem extends HierarchyItem {
    constructor(
        public parent: RefreshableHierarchyItem | null,
        collapsibleState?: vscode.TreeItemCollapsibleState
    ) {
        super(parent, collapsibleState)
    }

    refresh() {
        this.leavesChanged()
    }

    public typeContext?: string

    protected leavesChanged() {
        this.contextValue = this.serializeContext({
            type: this.typeContext,
            leafTypes: [...new Set(this.findAllLeafs(
                <(leaf: HierarchyItem) => leaf is RefreshableHierarchyItem>(leaf => leaf instanceof RefreshableHierarchyItem))
            )].map(leaf => leaf.typeContext).join(',')
        })

        this.parent?.leavesChanged()
    }

    private serializeContext(context: object) {
        return Object.entries(context).map(
            ([key, value]) => `${key}:${value}`
        ).join(' ')
    }
}

export abstract class SynchronizableHierarchyItem<
    TKey,
    TItem extends RefreshableHierarchyItem
> extends RefreshableHierarchyItem {
    constructor(parent: RefreshableHierarchyItem | null, collapsibleState?: vscode.TreeItemCollapsibleState) {
        super(parent, collapsibleState)
        this.children = new Map<TKey, TItem>()
    }

    private children: Map<TKey, TItem>

    getChildren() {
        return this.children.values()
    }

    refresh() {
        const oldChildren = this.children
        this.children = new Map(
            [...this.getChildrenKeys()].map(key => {
                const child = oldChildren.get(key) ?? this.createItemChild(key)
                this.refreshChildItem(child, key)
                return [key, child]
            })
        )

        super.refresh()
    }

    protected get basicChildren(): ReadonlyMap<TKey, TItem> {
        return this.children
    }

    protected refreshChildItem(child: TItem, _key: TKey) {
        child.refresh()
    }

    protected abstract getChildrenKeys(): Iterable<TKey>

    protected abstract createItemChild(key: TKey): TItem
}

export type HierarchyNodeItemOptions = {
    showCountInDescription: boolean
}

export abstract class HierarchyNodeItem<
    TPathSegment,
    TLeafKey,
    TComplexItem extends HierarchyNodeItem<TPathSegment, TLeafKey, TComplexItem, TLeafItem>,
    TLeafItem extends RefreshableHierarchyItem
> extends SynchronizableHierarchyItem<TPathSegment | TLeafKey, TComplexItem | TLeafItem> {
    constructor(
        public path: readonly TPathSegment[],
        parent: RefreshableHierarchyItem,
        options?: Partial<HierarchyNodeItemOptions>
    ) {
        super(parent, vscode.TreeItemCollapsibleState.Collapsed)

        if (options?.showCountInDescription) {
            this.showCountInDescription = options?.showCountInDescription
        }

        this.complexBuckets = new Map<TPathSegment, TLeafKey[]>()
    }

    public allLeafs: readonly TLeafKey[] = []
    /** If set, will be used to sort all complex item keys. */
    protected pathSegmentSorters?: ReadonlyArray<_.Many<_.ListIteratee<TPathSegment>>>
    protected leafSorters?: ReadonlyArray<_.Many<_.ListIteratee<TLeafKey>>>
    private complexBuckets: Map<TPathSegment, TLeafKey[]>
    protected showCountInDescription = false

    protected *getChildrenKeys(): Iterable<TPathSegment | TLeafKey> {
        this.complexBuckets.clear()
        const leafKeys: TLeafKey[] = []
        for (const leaf of this.allLeafs) {
            const pathSegment = this.getPathSegment(leaf)
            const bucket = pathSegment
                ? mapUtils.getOrSet(this.complexBuckets, pathSegment, () => [])
                : leafKeys
            bucket.push(leaf)
        }

        let complexKeys: Iterable<TPathSegment> = this.complexBuckets.keys()
        if (this.pathSegmentSorters) {
            complexKeys = _.sortBy([...complexKeys], ...this.pathSegmentSorters)
        }
        let finalLeafKeys: Iterable<TLeafKey> = leafKeys
        if (this.leafSorters) {
            finalLeafKeys = _.sortBy([...finalLeafKeys], ...this.leafSorters)
        }
        yield* complexKeys
        yield* finalLeafKeys
    }

    protected getPathSegment(leafKey: TLeafKey) {
        return this.getPath(leafKey)[this.path.length]
    }

    protected abstract getPath(leafKey: TLeafKey): TPathSegment[]

    protected get hasComplexChildren() {
        return iterUtils.some(this.basicChildren.values(), item => this.isComplexItem(item))
    }

    refresh() {
        this.label = this.labelFromPathSegment(_.last(this.path))
        if (this.showCountInDescription) {
            this.description = HierarchyNodeItem.makeDescriptionForCount(this.allLeafs)
        }

        super.refresh()
    }

    static makeDescriptionForCount(countable: { length: number }): string  {
        return `(${
            Intl.NumberFormat('en', {
                notation: 'compact'
            }).format(countable.length)
        })`
    }

    protected refreshChildItem(child: TComplexItem | TLeafItem, key: TPathSegment | TLeafKey) {
        if (this.isComplexItem(child)) {
            assert(this.isPathSegment(key))
            const leafs = this.getLeafsForPathSegment(key)
            assert(leafs)
            child.allLeafs = leafs
        }

        super.refreshChildItem(child, key)
    }

    protected getLeafsForPathSegment(pathSegment: TPathSegment) {
        return this.complexBuckets.get(pathSegment)
    }

    protected abstract isComplexItem(child: TComplexItem | TLeafItem): child is TComplexItem
    protected abstract isPathSegment(key: TPathSegment | TLeafKey): key is TPathSegment

    protected abstract labelFromPathSegment(pathSegment?: TPathSegment): string | vscode.TreeItemLabel
}

export abstract class LabeledHierarchyNodeItem<
    TLeafModel,
    TComplexItem extends LabeledHierarchyNodeItem<TLeafModel, TComplexItem, TLeafItem>,
    TLeafItem extends RefreshableHierarchyItem
> extends HierarchyNodeItem<string, TLeafModel, TComplexItem, TLeafItem> {
    isPathSegment(key: string | TLeafModel): key is string {
        return _.isString(key)
    }

    labelFromPathSegment(pathSegment: string) {
        return pathSegment
    }
}
