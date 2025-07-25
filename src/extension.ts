import * as vscode from 'vscode';
import * as path from 'path';

// Create output channel for logging
const outputChannel = vscode.window.createOutputChannel('Auto Hex Editor');

function log(message: string, ...args: any[]) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] ${message}`;
    console.log(formattedMessage, ...args);
    outputChannel.appendLine(formattedMessage + (args.length > 0 ? ' ' + JSON.stringify(args) : ''));
}

export function activate(context: vscode.ExtensionContext) {
    log('Auto Hex Editor extension is now active!');
    outputChannel.show(true); // Show output panel but don't steal focus

    // Configuration
    let config = vscode.workspace.getConfiguration('autoHexEditor');
    let isEnabled = config.get<boolean>('enabled', true);
    log('Extension enabled:', isEnabled);

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('autoHexEditor')) {
                config = vscode.workspace.getConfiguration('autoHexEditor');
                isEnabled = config.get<boolean>('enabled', true);
                log('Configuration changed. Extension enabled:', isEnabled);
            }
        })
    );

    // Track already processed URIs to avoid loops
    const processedUris = new Map<string, number>(); // URI -> timestamp

    // Register command to open with hex editor
    context.subscriptions.push(
        vscode.commands.registerCommand('autoHexEditor.openWithHexEditor', async (uri?: vscode.Uri) => {
            if (!uri) {
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    uri = activeEditor.document.uri;
                } else {
                    vscode.window.showErrorMessage('No file selected');
                    return;
                }
            }

            log(`Opening with Hex Editor via command: ${uri.fsPath}`);
            await vscode.commands.executeCommand('vscode.openWith', uri, 'hexEditor.hexedit');
        })
    );

    // Watch for tab changes to detect binary files
    let lastActiveTab: vscode.Tab | undefined;
    
    context.subscriptions.push(
        vscode.window.tabGroups.onDidChangeTabs(async (event) => {
            const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
            
            if (!activeTab || !isEnabled) return;
            
            // Check if the tab changed
            if (lastActiveTab?.input === activeTab.input) return;
            lastActiveTab = activeTab;

            // Check if it's a file input
            const input = activeTab.input;
            if (!(input instanceof vscode.TabInputText) && 
                !(input instanceof vscode.TabInputCustom) &&
                !(input instanceof vscode.TabInputNotebook)) {
                return;
            }

            // Get the URI
            const uri = (input as any).uri;
            if (!uri || uri.scheme !== 'file') return;

            const fileName = path.basename(uri.fsPath);
            log(`Tab changed to: ${fileName}`);

            // Wait a bit to see if a text editor opens for this file
            setTimeout(async () => {
                // Check if there's no text editor for this file (meaning VS Code couldn't open it as text)
                const hasTextEditor = vscode.window.visibleTextEditors.some(
                    editor => editor.document.uri.toString() === uri.toString()
                );

                // Also check if the current tab is still the same one
                const currentTab = vscode.window.tabGroups.activeTabGroup.activeTab;
                const isSameTab = currentTab && currentTab.input === input;

                if (!hasTextEditor && isSameTab) {
                    log(`Binary file detected (no text editor available): ${fileName}`);

                    // Check if already opened as hex within last 2 seconds (to prevent loops)
                    const now = Date.now();
                    const lastProcessed = processedUris.get(uri.toString());
                    if (lastProcessed && now - lastProcessed < 2000) {
                        log(`Recently processed, skipping: ${fileName}`);
                        return;
                    }

                    // Mark as processed with timestamp
                    processedUris.set(uri.toString(), now);

                    // Automatically open with Hex Editor
                    log(`Automatically opening ${fileName} with Hex Editor...`);
                    
                    try {
                        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                        await vscode.commands.executeCommand('vscode.openWith', uri, 'hexEditor.hexedit');
                        log(`Successfully opened ${fileName} with Hex Editor`);
                    } catch (error) {
                        log(`Error opening with hex editor: ${error}`);
                    }
                }
            }, 300); // Wait 300ms to ensure VS Code has tried to open the file
        })
    );

    // Create a status bar item for manual hex editor opening
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'autoHexEditor.openWithHexEditor';
    statusBarItem.text = '$(file-binary) Hex';
    statusBarItem.tooltip = 'Open current file with Hex Editor';

    // Show status bar for all files when there's an active editor
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && editor.document.uri.scheme === 'file') {
                statusBarItem.show();
            } else {
                statusBarItem.hide();
            }
        })
    );

    context.subscriptions.push(statusBarItem);
}

export function deactivate() {
    log('Auto Hex Editor extension is now deactivated');
    outputChannel.dispose();
}