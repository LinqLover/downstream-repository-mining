import { DeclarationLocation, FilePositionPrimitive, Reference } from 'dowdep'
import * as vscode from 'vscode'

import { Extension, positionToVscode } from './extension'
import * as mapUtils from './utils/node/mapUtils'


type UriPrimitive = ReturnType<vscode.Uri['toString']>

export class DeclarationCodeLensProvider implements vscode.CodeLensProvider {
    constructor(
        protected extension: Extension
    ) { }

    static supportedLanguages = ['javascript', 'javascriptreact', 'typescript', 'typescriptreact']

    private _enabled = true
    get enabled() {
        return this._enabled
    }
    async setEnabled(value: boolean) {
        if (this.enabled === value) {
            return
        }
        this._enabled = value
        this.refresh()
    }

    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event

    protected references = new Map<UriPrimitive, Map<FilePositionPrimitive, Reference[]>>()

    register() {
        vscode.languages.registerCodeLensProvider(
            DeclarationCodeLensProvider.supportedLanguages.map(language => ({language})),
            this
        )
        return this
    }

    async modelChanged() {
        this.refresh()
    }

    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken) {
        const codeLenses = new Array<DeclarationCodeLens>()
        for (const codeLens of this.createCodeLenses(document)) {
            codeLenses.push(codeLens)
            if (token.isCancellationRequested) {
                throw new vscode.CancellationError()
            }
        }
        return codeLenses
    }

    public resolveCodeLens(codeLens: DeclarationCodeLens) {
        if (!this._enabled) {
            return null
        }

        codeLens.resolve()
    }

    protected *createCodeLenses(document: vscode.TextDocument) {
        if (!this._enabled) {
            return
        }
        if (document.isUntitled) {
            return
        }

        const fileReferences = this.references.get(document.uri.toString())
        if (!fileReferences) {
            return
        }
        for (const references of fileReferences.values()) {
            yield this.createCodeLens(references)
        }
    }

    protected createCodeLens(references: readonly Reference[]) {
        return DeclarationCodeLens.create(references)
    }

    protected refresh() {
        this.references.clear()
        this.extension.packages
            .flatMap($package => $package.allReferences)
            .forEach(reference => {
                const packageDirectory = reference.dependency.$package.directory
                if (!(packageDirectory && reference.declaration instanceof DeclarationLocation)) {
                    return
                }

                const location = reference.declarationLocation()
                const fileReferences = mapUtils.getOrSet(
                    this.references,
                    vscode.Uri.joinPath(vscode.Uri.parse(packageDirectory), location.file).toString(),
                    () => new Map<FilePositionPrimitive, Reference[]>())
                const memberReferences = mapUtils.getOrSet(
                    fileReferences,
                    location.position.toPrimitive(),
                    () => [])
                memberReferences.push(reference)
            })

        this._onDidChangeCodeLenses.fire()
    }
}

class DeclarationCodeLens extends vscode.CodeLens {
    private constructor(
        public references: readonly Reference[],
        range: vscode.Range
    ) {
        super(range)
    }

    static create(references: readonly Reference[]) {
        const position = positionToVscode(references[0].declarationLocation().position)
        return new this(references, new vscode.Range(position, position))
    }

    get declaration() {
        return this.references[0].declarationLocation()
    }

    get $package() {
        return this.references[0].dependency.$package
    }

    resolve() {
        this.command = {
            title: `${this.references.length} downstream dependencies`,
            tooltip: "Browse all downstream dependencies",
            command: 'dowdep.browseMemberDependencies',
            arguments: [this.$package, this.declaration]
        }
    }
}
