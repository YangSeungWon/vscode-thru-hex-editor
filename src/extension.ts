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
    let isProcessingFile = false;

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

    // Watch for tab changes - this is the main detection mechanism
    context.subscriptions.push(
        vscode.window.tabGroups.onDidChangeTabs(async (event) => {
            if (!isEnabled || isProcessingFile) return;

            // Get the active tab
            const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
            if (!activeTab) return;

            // Check if it's a file
            const input = activeTab.input;
            if (!(input instanceof vscode.TabInputText || 
                  input instanceof vscode.TabInputCustom ||
                  input instanceof vscode.TabInputNotebook)) {
                return;
            }

            const uri = (input as any).uri;
            if (!uri || uri.scheme !== 'file') return;

            const fileName = path.basename(uri.fsPath);
            
            // Check if this file was already processed recently
            const now = Date.now();
            const lastProcessed = processedUris.get(uri.toString());
            if (lastProcessed && now - lastProcessed < 5000) {
                return;
            }

            log(`Tab activated: ${fileName}`);

            // Wait for VS Code to attempt opening the file
            setTimeout(async () => {
                // Check if the tab is still active and same file
                const currentActiveTab = vscode.window.tabGroups.activeTabGroup.activeTab;
                if (!currentActiveTab) {
                    log(`No active tab, skipping check for: ${fileName}`);
                    return;
                }
                
                // Check if it's still the same file
                const currentInput = currentActiveTab.input;
                const currentUri = (currentInput as any).uri;
                if (!currentUri || currentUri.toString() !== uri.toString()) {
                    log(`Tab changed to different file, skipping check for: ${fileName}`);
                    return;
                }

                // Debug: Log all visible text editors
                log(`Checking text editors for ${fileName}...`);
                log(`File URI: ${uri.toString()}`);
                log(`File path: ${uri.fsPath}`);
                log(`Visible text editors count: ${vscode.window.visibleTextEditors.length}`);
                vscode.window.visibleTextEditors.forEach(editor => {
                    log(`  - Editor: ${path.basename(editor.document.fileName)} (${editor.document.uri.toString()})`);
                });

                // Check if there's a text editor for this file
                const hasTextEditor = vscode.window.visibleTextEditors.some(
                    editor => editor.document.uri.toString() === uri.toString()
                );

                log(`Has text editor for ${fileName}: ${hasTextEditor}`);

                // If no text editor exists, it's a binary file (VS Code shows the warning)
                if (!hasTextEditor) {
                    log(`Binary file confirmed (no text editor): ${fileName}`);
                    
                    // Mark as processed
                    processedUris.set(uri.toString(), now);
                    isProcessingFile = true;

                    try {
                        log(`Opening ${fileName} with Hex Editor...`);
                        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                        await vscode.commands.executeCommand('vscode.openWith', uri, 'hexEditor.hexedit');
                        log(`Successfully opened ${fileName} with Hex Editor`);
                    } catch (error) {
                        log(`Error opening with hex editor: ${error}`);
                    } finally {
                        isProcessingFile = false;
                    }
                } else {
                    log(`Text editor found for ${fileName}, not a binary file`);
                }
            }, 300); // Reduced delay for better responsiveness
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

    // Clean up old entries periodically
    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        const oldEntries: string[] = [];
        processedUris.forEach((timestamp, uri) => {
            if (now - timestamp > 60000) { // Remove entries older than 1 minute
                oldEntries.push(uri);
            }
        });
        oldEntries.forEach(uri => processedUris.delete(uri));
    }, 30000); // Clean up every 30 seconds

    // Clean up interval on deactivate
    context.subscriptions.push({
        dispose: () => clearInterval(cleanupInterval)
    });
}

export function deactivate() {
    log('Auto Hex Editor extension is now deactivated');
    outputChannel.dispose();
}