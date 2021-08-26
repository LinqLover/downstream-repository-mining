import * as vscode from 'vscode'
import { DependenciesProvider } from './DependenciesProvider'

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log("Congratulations, your extension \"dowdep\" is now active!")

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    const disposable = vscode.commands.registerCommand('dowdep.helloWorld', () => {
        // The code you place here will be executed every time your command is executed
        // Display a message box to the user
        vscode.window.showInformationMessage("Hello World from dowdep! 🚀")

        vscode.window.createTreeView('dowdepDependencies', {
            treeDataProvider: new DependenciesProvider(vscode.workspace.workspaceFolders)
        })

    })

    context.subscriptions.push(disposable)
}

// this method is called when your extension is deactivated
export function deactivate() {
    // no deactivation logic yet
}
