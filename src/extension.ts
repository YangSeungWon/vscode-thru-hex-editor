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
    let showNotification = config.get<boolean>('showNotification', true);
    log('Extension enabled:', isEnabled);

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('autoHexEditor')) {
                config = vscode.workspace.getConfiguration('autoHexEditor');
                isEnabled = config.get<boolean>('enabled', true);
                showNotification = config.get<boolean>('showNotification', true);
                log('Configuration changed. Extension enabled:', isEnabled);
            }
        })
    );

    // Track already processed URIs to avoid loops
    const processedUris = new Map<string, number>(); // URI -> timestamp
    const scheduledForHex = new Set<string>();
    const notifiedFiles = new Set<string>();

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

    // Listen for active editor changes (text editors)
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(async (editor) => {
            if (!editor) {
                log('No active editor');
                return;
            }

            if (!isEnabled) {
                log('Extension is disabled');
                return;
            }

            const document = editor.document;
            const uri = document.uri;
            const fileName = path.basename(document.fileName);
            
            log(`Active text editor changed: ${fileName} (${uri.toString()})`);
            
            // Skip if recently processed (within 2 seconds)
            const now = Date.now();
            const lastProcessed = processedUris.get(uri.toString());
            if (lastProcessed && now - lastProcessed < 2000) {
                log(`Recently processed, skipping: ${fileName}`);
                return;
            }
            
            if (scheduledForHex.has(uri.toString())) {
                log(`File already scheduled for hex editor: ${fileName}`);
                return;
            }
            
            if (uri.scheme !== 'file') {
                log(`Not a file scheme: ${uri.scheme}`);
                return;
            }

            // Check if file has no extension
            const ext = path.extname(fileName);
            log(`File extension: "${ext}" for file: ${fileName}`);

            // Skip dotfiles (files starting with .)
            if (fileName.startsWith('.')) {
                log(`Dotfile detected. Skipping: ${fileName}`);
                return;
            }

            if (!ext && fileName !== '') {
                log(`No extension detected. Opening ${fileName} with Hex Editor...`);
                
                // Mark as scheduled
                scheduledForHex.add(uri.toString());
                processedUris.set(uri.toString(), Date.now());
                log(`Added to tracking sets: ${fileName}`);

                // Immediately close and reopen with hex editor
                setImmediate(async () => {
                    try {
                        log(`Closing active editor for: ${fileName}`);
                        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                        
                        log(`Opening with Hex Editor: ${fileName}`);
                        await vscode.commands.executeCommand('vscode.openWith', uri, 'hexEditor.hexedit');
                        
                        log(`Successfully opened ${fileName} with Hex Editor`);
                    } catch (error) {
                        log(`Error opening with hex editor: ${error}`);
                        console.error('Error opening with hex editor:', error);
                    } finally {
                        // Clean up
                        scheduledForHex.delete(uri.toString());
                        log(`Removed from scheduledForHex: ${fileName}`);
                    }
                });
            } else {
                log(`File has extension or is empty. Skipping: ${fileName}`);
            }
        })
    );

    // Monitor file open events
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(async (document) => {
            if (!isEnabled || document.uri.scheme !== 'file') {
                return;
            }

            const fileName = path.basename(document.fileName);
            const ext = path.extname(fileName);
            
            log(`Text document opened: ${fileName}`);

            if (!ext && fileName !== '') {
                // This handles text files without extensions
                log(`Extensionless text document detected: ${fileName}`);
            }
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
            const ext = path.extname(fileName);

            // Skip dotfiles
            if (fileName.startsWith('.')) {
                return;
            }

            if (!ext && fileName !== '') {
                // Check if there's no text editor for this file (meaning it's binary)
                const hasTextEditor = vscode.window.visibleTextEditors.some(
                    editor => editor.document.uri.toString() === uri.toString()
                );

                if (!hasTextEditor) {
                    log(`Binary file detected via tab change: ${fileName}`);

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
                    
                    setTimeout(async () => {
                        try {
                            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                            await vscode.commands.executeCommand('vscode.openWith', uri, 'hexEditor.hexedit');
                            log(`Successfully opened ${fileName} with Hex Editor`);
                        } catch (error) {
                            log(`Error opening with hex editor: ${error}`);
                        }
                    }, 100); // Small delay to ensure the tab is fully loaded
                }
            }
        })
    );

    // Create a status bar item for manual hex editor opening
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'autoHexEditor.openWithHexEditor';
    statusBarItem.text = '$(file-binary) Hex';
    statusBarItem.tooltip = 'Open current file with Hex Editor';

    // Show/hide status bar based on active editor
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && editor.document.uri.scheme === 'file') {
                const ext = path.extname(editor.document.fileName);
                if (!ext) {
                    statusBarItem.show();
                } else {
                    statusBarItem.hide();
                }
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