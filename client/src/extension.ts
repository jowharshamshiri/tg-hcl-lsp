import * as path from 'path';
import {
	workspace as Workspace, window as Window, ExtensionContext, TextDocument, OutputChannel, WorkspaceFolder, Uri, Range
} from 'vscode';

import {
	LanguageClient, LanguageClientOptions, TransportKind
} from 'vscode-languageclient/node';
import { DependencyTreeViewProvider } from './dependencyTreeHandler';
import type { DependencyGraphNode } from './dependencyTreeHandler';

let defaultClient: LanguageClient | undefined;
const clients = new Map<string, LanguageClient>();
let evaluatableDecoration: ReturnType<typeof Window.createTextEditorDecorationType>;

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
		initializationOptions: { isWorkspaceTrusted: Workspace.isTrusted },
		documentSelector: folder
			? [{ scheme: 'file', language: 'terragrunt', pattern: `${folder.uri.fsPath}/**/*.hcl` }]
			: [
				{ scheme: 'file', language: 'terragrunt', pattern: '**/*.hcl' },
				{ scheme: 'untitled', language: 'terragrunt' }
			],
		diagnosticCollectionName: 'tg-hcl-lsp',
		workspaceFolder: folder,
		outputChannel: outputChannel
	};
}

export function activate(context: ExtensionContext) {
	const module = context.asAbsolutePath(path.join('dist', 'server', 'server.js'));
	const outputChannel: OutputChannel = Window.createOutputChannel('tg-hcl-lsp');
	context.subscriptions.push(outputChannel);
	evaluatableDecoration = Window.createTextEditorDecorationType({ textDecoration: 'underline dotted #8b5cf6' });
	context.subscriptions.push(evaluatableDecoration);

	function didOpenTextDocument(document: TextDocument): void {
		// We are only interested in terragrunt/HCL files
		if (document.languageId !== 'terragrunt' || (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled')) {
			return;
		}

		const uri = document.uri;
		let folder = Workspace.getWorkspaceFolder(uri);
		// Untitled and standalone files use a rootless client so language features
		// do not depend on first adding the document's directory as a workspace.
		if (!folder && !defaultClient) {
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
			const client = defaultClient;
			void startClient(client, context, outputChannel, () => {
				if (defaultClient === client) defaultClient = undefined;
			});
		}

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
			clients.set(folder.uri.toString(), client);
			const folderUri = folder.uri.toString();
			void startClient(client, context, outputChannel, () => {
				if (clients.get(folderUri) === client) clients.delete(folderUri);
			});
		}
	}

	context.subscriptions.push(Workspace.onDidOpenTextDocument(didOpenTextDocument));
	context.subscriptions.push(Workspace.onDidGrantWorkspaceTrust(() => {
		for (const client of [defaultClient, ...clients.values()]) {
			client?.sendNotification('terragrunt/workspaceTrustChanged', { isTrusted: true });
		}
	}));
	context.subscriptions.push(Workspace.onDidChangeWorkspaceFolders(() => {
		_sortedWorkspaceFolders = undefined;
	}));
	Workspace.textDocuments.forEach(didOpenTextDocument);
	context.subscriptions.push(Workspace.onDidChangeWorkspaceFolders((event) => {
		for (const folder of event.removed) {
			const client = clients.get(folder.uri.toString());
			if (client) {
				clients.delete(folder.uri.toString());
				void client.stop().catch(error => {
					outputChannel.appendLine(`Failed to stop language client: ${formatError(error)}`);
				});
			}
		}
	}));
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

async function startClient(
	client: LanguageClient,
	context: ExtensionContext,
	outputChannel: OutputChannel,
	onFailure: () => void
): Promise<void> {
	try {
		await client.start();
		setupClientHandlers(client, context);
	} catch (error) {
		onFailure();
		const message = `Terragrunt language server failed to start: ${formatError(error)}`;
		outputChannel.appendLine(message);
		void Window.showErrorMessage(message);
		await client.dispose().catch(disposeError => {
			outputChannel.appendLine(`Failed to dispose language client: ${formatError(disposeError)}`);
		});
	}
}

function setupClientHandlers(client: LanguageClient, context: ExtensionContext): void {
	context.subscriptions.push(
		client.onNotification('terragrunt/evaluatableRanges', (params: { uri: string; ranges: Array<{ start: { line: number; character: number }; end: { line: number; character: number } }> }) => {
			const editor = Window.visibleTextEditors.find(candidate => candidate.document.uri.toString() === params.uri);
			if (!editor) return;
			editor.setDecorations(evaluatableDecoration, params.ranges.map(range => ({ range: new Range(range.start.line, range.start.character, range.end.line, range.end.character) })));
		}),
		client.onNotification('terragrunt/dependencyTreeStatus', () => {
			DependencyTreeViewProvider.createOrShow(context.extensionUri);
		}),

		client.onNotification('terragrunt/dependencyTreeResult', (params: { rootNode?: DependencyGraphNode, result?: string }) => {
			DependencyTreeViewProvider.createOrShow(context.extensionUri);

			// Update the webview with the tree data
			if (DependencyTreeViewProvider.currentPanel) {
				if (params.result) DependencyTreeViewProvider.currentPanel.showError(params.result);
				else DependencyTreeViewProvider.currentPanel.updateTreeData(params.rootNode);
			}
		})
	);
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
