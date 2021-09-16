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

    private _synchronizer = new Synchronizer()
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

    protected getRoots = this._synchronizer.spy(() => {
        return this.basicGetRoots()
    })

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
                return item
            }
        }
    }
}

export abstract class HierarchyItem extends vscode.TreeItem {
    constructor(collapsibleState?: vscode.TreeItemCollapsibleState) {
        super("", collapsibleState)
    }
    abstract getChildren(): IterableIterator<HierarchyItem>

    public findItem<T extends HierarchyItem>(predicate: (item: HierarchyItem) => boolean): T | undefined {
        if (predicate(this)) {
            return <T><unknown>this
        }
        for (const childItem of this.getChildren()) {
            const item = childItem.findItem(predicate)
            if (item) {
                return <T>item
            }
        }
    }
}

export abstract class RefreshableHierarchyItem extends HierarchyItem {
    abstract refresh(): void
}

export abstract class SynchronizableHierarchyItem<
    TKey,
    TItem extends RefreshableHierarchyItem
> extends RefreshableHierarchyItem {
    constructor(collapsibleState?: vscode.TreeItemCollapsibleState) {
        super(collapsibleState)
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
        public path: ReadonlyArray<TPathSegment>,
        private options?: Partial<HierarchyNodeItemOptions>
    ) {
        super(vscode.TreeItemCollapsibleState.Collapsed)

        if (options?.showCountInDescription) {
            this.showCountInDescription = options?.showCountInDescription
        }

        this.complexBuckets = new Map<TPathSegment, TLeafKey[]>()
    }

    public allLeafs: ReadonlyArray<TLeafKey> = []
    /** If set, will be used to sort all complex item keys. */
    protected pathSegmentSorters?: ReadonlyArray<_.Many<_.ListIteratee<TPathSegment>>>
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
        yield* complexKeys
        yield* leafKeys
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