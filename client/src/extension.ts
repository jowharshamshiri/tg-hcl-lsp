import * as path from 'path';
import {
	workspace as Workspace, window as Window, ExtensionContext, TextDocument, OutputChannel, WorkspaceFolder, Uri
} from 'vscode';

import {
	LanguageClient, LanguageClientOptions, TransportKind
} from 'vscode-languageclient/node';
import { DependencyTreeViewProvider } from './dependencyTreeHandler';

let defaultClient: LanguageClient;
const clients = new Map<string, LanguageClient>();

let _sortedWorkspaceFolders: string[] | undefined;
function sortedWorkspaceFolders(): string[] {
	if (_sortedWorkspaceFolders === void 0) {
		_sortedWorkspaceFolders = Workspace.workspaceFolders ? Workspace.workspaceFolders.map(folder => {
			let result = folder.uri.toString();
			if (result.charAt(result.length - 1) !== '/') {
				result = result + '/';
			}
			return result;
		}).sort(
			(a, b) => {
				return a.length - b.length;
			}
		) : [];
	}
	return _sortedWorkspaceFolders;
}
Workspace.onDidChangeWorkspaceFolders(() => _sortedWorkspaceFolders = undefined);

function getOuterMostWorkspaceFolder(folder: WorkspaceFolder): WorkspaceFolder {
	const sorted = sortedWorkspaceFolders();
	for (const element of sorted) {
		let uri = folder.uri.toString();
		if (uri.charAt(uri.length - 1) !== '/') {
			uri = uri + '/';
		}
		if (uri.startsWith(element)) {
			return Workspace.getWorkspaceFolder(Uri.parse(element))!;
		}
	}
	return folder;
}

function createClientOptions(outputChannel: OutputChannel, folder?: WorkspaceFolder): LanguageClientOptions {
	return {
		documentSelector: folder
			? [{ scheme: 'file', language: 'terragrunt', pattern: `${folder.uri.fsPath}/**/*.hcl` }]
			: [
				{ scheme: 'untitled', language: 'terragrunt' },
				{ scheme: 'untitled', language: 'terragrunt', pattern: '**/*.hcl' }
			],
		diagnosticCollectionName: 'tg-hcl-lsp',
		workspaceFolder: folder,
		outputChannel: outputChannel,
		middleware: {
			provideCodeLenses: async (document, token, next) => {
				const result = await next(document, token);
				return result;
			},
			provideCodeActions: async (document, range, context, token, next) => {
				outputChannel.appendLine(`Code action requested for ${document.uri}`);
				const actions = await next(document, range, context, token);
				outputChannel.appendLine(`Returned actions: ${JSON.stringify(actions)}`);
				return actions;
			}
		}
	};
}

export function activate(context: ExtensionContext) {
	let module = context.asAbsolutePath(path.join('dist', 'server', 'server.js'));
	const outputChannel: OutputChannel = Window.createOutputChannel('tg-hcl-lsp');

	function didOpenTextDocument(document: TextDocument): void {
		// We are only interested in terragrunt/HCL files
		if (document.languageId !== 'terragrunt' || (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled')) {
			return;
		}

		const uri = document.uri;
		// Untitled files go to a default client.
		if (uri.scheme === 'untitled' && !defaultClient) {
			const serverOptions = {
				run: { module, transport: TransportKind.ipc },
				debug: { module, transport: TransportKind.ipc }
			};
			defaultClient = new LanguageClient(
				'tg-hcl-lsp',
				'Terragrunt HCL Language Server',
				serverOptions,
				createClientOptions(outputChannel)
			);
			defaultClient.start();
			setupClientHandlers(defaultClient, context);
			return;
		}

		let folder = Workspace.getWorkspaceFolder(uri);
		if (!folder) {
			return;
		}

		folder = getOuterMostWorkspaceFolder(folder);

		if (!clients.has(folder.uri.toString())) {
			const serverOptions = {
				run: { module, transport: TransportKind.ipc },
				debug: { module, transport: TransportKind.ipc }
			};
			const client = new LanguageClient(
				'tg-hcl-lsp',
				'Terragrunt HCL Language Server',
				serverOptions,
				createClientOptions(outputChannel, folder)
			);
			client.start();
			setupClientHandlers(client, context);
			clients.set(folder.uri.toString(), client);
		}
	}

	Workspace.onDidOpenTextDocument(didOpenTextDocument);
	Workspace.textDocuments.forEach(didOpenTextDocument);
	Workspace.onDidChangeWorkspaceFolders((event) => {
		for (const folder of event.removed) {
			const client = clients.get(folder.uri.toString());
			if (client) {
				clients.delete(folder.uri.toString());
				client.stop();
			}
		}
	});
}

export function deactivate(): Thenable<void> {
	const promises: Thenable<void>[] = [];
	if (defaultClient) {
		promises.push(defaultClient.stop());
	}
	for (const client of clients.values()) {
		promises.push(client.stop());
	}
	return Promise.all(promises).then(() => undefined);
}

function setupClientHandlers(client: LanguageClient, context: ExtensionContext) {
    client.onReady().then(() => {
        console.log('Setting up client notification handlers');

        client.onNotification('terragrunt/functionEvaluation', (params: { function: string, result: string }) => {
            console.log('Received function evaluation notification:', params);
            Window.showInformationMessage(`${params.function}: ${params.result}`);
        });

        client.onNotification('terragrunt/dependencyTreeResult', (params: { result: string }) => {
            // Create or show the webview
            DependencyTreeViewProvider.createOrShow(context.extensionUri);

            // Convert the tree string to a hierarchical object
            const treeData = convertTreeStringToHierarchy(params.result);

            // Update the webview with the tree data
            if (DependencyTreeViewProvider.currentPanel) {
                DependencyTreeViewProvider.currentPanel.updateTreeData(treeData);
            }
        });
    }).catch(err => {
        console.error('Failed to setup client handlers:', err);
    });
}

// Helper function to convert tree string to hierarchy
function convertTreeStringToHierarchy(treeString: string) {
    const lines = treeString.split('\n');
    const root: any = { name: '', type: '', children: [] };
    const stack: any[] = [{ node: root, depth: -1 }];

    lines.forEach(line => {
        if (!line.trim()) return;

        const depth = (line.match(/│   |    /g) || []).length;
        const name = line.match(/\[(\w+)\] (.+)$/);
        
        if (name) {
            const node = {
                name: name[2],
                type: name[1].toLowerCase(),
                children: []
            };

            while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
                stack.pop();
            }

            stack[stack.length - 1].node.children.push(node);
            stack.push({ node, depth });
        }
    });

    return root.children[0];  // Return the actual root node
}