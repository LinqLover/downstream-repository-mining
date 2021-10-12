import * as path from 'path'

import { runTests } from 'vscode-test'


async function main() {
    try {
        // The folder containing the Extension Manifest package.json
        const extensionDevelopmentPath = path.resolve(__dirname, '../../')

        // The path to test runner
        const extensionTestsPath = path.resolve(__dirname, './suite/index')

        const testWorkspacePath = path.resolve(__dirname, '../node_modules/jsonschema')
        console.log("starting in", testWorkspacePath)

        // Download VS Code, unzip it and run the integration test
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [testWorkspacePath]
        })
    } catch (err) {
        console.error("Failed to run tests")
        process.exit(1)
    }
}

main()
