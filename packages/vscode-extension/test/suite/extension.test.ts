import assert from 'assert'

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode'
import { Extension } from '../../src/extension'
import { ReferenceItem } from '../../src/views'


const pkgName = 'jsonschema'

async function activateExtension() {
    const ext = vscode.extensions.getExtension<Extension>('LinqLover.dowdep-vscode-extension')
    assert(ext)

    if (!ext.isActive) {
        await ext.activate()
    }

    return ext.exports
}

suite("Extension Test Suite", () => {
    vscode.window.showInformationMessage("Start all tests.")

    test("Smoke test", async () => {
        const ext = await activateExtension()
        assert(ext)
        assert(ext.packages[0]?.name === pkgName)

        const depLimit = 6
        await vscode.workspace.getConfiguration().update('dowdep.dependencyLimit', depLimit)

        let pkgItem = ext.dependenciesProvider.getChildren()[0]
        assert(pkgItem)
        assert(pkgItem.label?.toString() === pkgName)
        assert([...pkgItem.getChildren()].length === 0)

        await ext.refreshDownstreamData()

        pkgItem = ext.dependenciesProvider.getChildren()[0]
        assert(pkgItem)
        assert(pkgItem.label?.toString() === pkgName)

        const depItems = [...pkgItem.getChildren()]
        assert(depItems.length >= depLimit / 1.5)
        for (const depItem of depItems) {
            assert(depItem.label?.toString())
            assert(depItem.tooltip)
        }

        const nonEmptyDepItems = depItems.filter(depItem => [...depItem.getChildren()].length)
        assert(nonEmptyDepItems.length >= depItems.length / 2)
        for (const depItem of nonEmptyDepItems) {
            const refItems = [...depItem.findAllLeafs()]
            assert(refItems.length)
            for (const refItem of refItems) {
                assert(refItem.constructor.name === ReferenceItem.name)
                assert(refItem.label?.toString())
            }
        }
    })
})
