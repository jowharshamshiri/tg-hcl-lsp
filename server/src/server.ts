import {
	createConnection,
	TextDocuments,
	ProposedFeatures,
	TextDocumentSyncKind,
	CompletionItem,
	TextDocumentChangeEvent,
	InitializeParams,
	MarkupKind
} from 'vscode-languageserver/node';

import fs from 'node:fs';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';
import { ParsedDocument, Workspace } from 'tghclparser';
import type { TerragruntConfig, TreeNode } from 'tghclparser';

const connection = createConnection(ProposedFeatures.all);

const documents = new TextDocuments(TextDocument);

const workspace = new Workspace();

const parsedDocuments = new Map<string, ParsedDocument>();

interface SerializedGraphNode {
	name: string;
	type: string;
	uri: string;
	openable: boolean;
	lineage: {
		includes: string[];
		dependencies: string[];
		reads: string[];
		includedBy: string[];
		dependedOnBy: string[];
		readBy: string[];
	};
	reading: string[];
	external: boolean;
	children: SerializedGraphNode[];
}

let workspaceFolder: string | null;

async function handleDocumentChange(event: TextDocumentChangeEvent<TextDocument>) {
	try {
		const document = event.document;
		const parsedDocument = new ParsedDocument(workspace, document.uri, document.getText());
		parsedDocuments.set(document.uri, parsedDocument);

		await workspace.addDocument(parsedDocument);

		const diagnostics = parsedDocument.getDiagnostics();
		connection.sendDiagnostics({
			uri: document.uri,
			diagnostics
		});
	} catch (error) {
		connection.console.error(
			`[Server(${process.pid}) ${workspaceFolder}] Error handling document change: ${error}`
		);
		connection.sendDiagnostics({
			uri: event.document.uri,
			diagnostics: [{
				severity: 1,
				range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
				message: error instanceof Error ? error.message : String(error),
				source: 'terragrunt-workspace'
			}]
		});

	}
}

connection.onInitialize((params: InitializeParams) => {
	workspaceFolder = params.rootUri;
	if (workspaceFolder) {
		workspace.setWorkspaceRoot(workspaceFolder);
	}

	return {
		capabilities: {
			textDocumentSync: {
				openClose: true,
				change: TextDocumentSyncKind.Incremental
			},
			hoverProvider: true,
			completionProvider: {
				resolveProvider: false,
				triggerCharacters: ['.', '=', ' ', '$', '{', '"']
			},
			documentLinkProvider: {
				resolveProvider: true
			},
			executeCommandProvider: {
				commands: ['terragrunt.dependencyTree']
			}
		}
	};
});

connection.onExecuteCommand(async (params) => {
	if (params.command === 'terragrunt.dependencyTree') {
		connection.sendNotification('terragrunt/dependencyTreeStatus', { message: 'Building the Terragrunt graph…' });
		try {
			const rootNode = await workspace.refreshDependencyTree();
			if (!rootNode) {
				connection.sendNotification('terragrunt/dependencyTreeResult', { result: 'No Terragrunt configurations were found.' });
				return;
			}
			const serialize = (node: TreeNode<TerragruntConfig>): SerializedGraphNode => {
				if (node.data.reading === undefined || node.data.external === undefined) {
					throw new Error(`Incomplete lineage metadata for ${node.data.uri}`);
				}
				return {
					name: node.name,
					type: node.type,
					uri: node.data.uri,
					openable: node.data.uri.startsWith('file:') && fs.existsSync(new URL(node.data.uri)),
					lineage: {
						includes: node.data.includes,
						dependencies: node.data.dependencies,
						reads: node.data.reads,
						includedBy: node.data.includedBy,
						dependedOnBy: node.data.dependedOnBy,
						readBy: node.data.readBy
					},
					reading: node.data.reading,
					external: node.data.external,
					children: node.children.map(serialize)
				};
			};
			connection.sendNotification('terragrunt/dependencyTreeResult', { rootNode: serialize(rootNode) });
		} catch (error) {
			connection.sendNotification('terragrunt/dependencyTreeResult', {
				result: error instanceof Error ? error.message : String(error)
			});
		}
	}
});

connection.onHover(async (params) => {
	try {
		const document = documents.get(params.textDocument.uri);
		if (!document) {
			return null;
		}

		const parsedDocument = parsedDocuments.get(document.uri);
		if (!parsedDocument) {
			return null;
		}

		const hoverResult = await parsedDocument.getHoverInfo(params.position);
		if (!hoverResult || !hoverResult.value) {
			return null;
		}

		return {
			contents: {
				kind: MarkupKind.Markdown,
				value: hoverResult.value
			},
			// range: hoverResult.range
		};

	} catch (error) {
		connection.console.error(`[Server(${process.pid}) ${workspaceFolder}] Error while providing hover: ${error}`);
		return null;
	}
});

connection.onCompletion(async (params): Promise<CompletionItem[]> => {
	try {
		const document = documents.get(params.textDocument.uri);
		if (!document) {
			return [];
		}

		const parsedDocument = parsedDocuments.get(document.uri);
		if (!parsedDocument) {
			return [];
		}

		const result = parsedDocument.getCompletionsAtPosition(params.position);
		if (!result) {
			return [];
		}

		return result;
	} catch (error) {
		connection.console.error(`[Server(${process.pid}) ${workspaceFolder}] Error while providing completions: ${error}`);
		return [];
	}
});

// Document link provider
connection.onDocumentLinks(async (params) => {
    try {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            return null;
        }

        const parsedDocument = parsedDocuments.get(document.uri);
        if (!parsedDocument) {
            return null;
        }

		return parsedDocument.getLinks();
    } catch (error) {
        connection.console.error(`Error providing document links: ${error}`);
        return null;
    }
});

// Handle document events
documents.onDidOpen(async (event) => {
	await handleDocumentChange(event);
});

documents.onDidChangeContent(async (event) => {
	await handleDocumentChange(event);
});

documents.onDidClose((event) => {
	parsedDocuments.delete(event.document.uri);
	workspace.removeDocument(event.document.uri);
});

// Listen on the documents and connection
documents.listen(connection);
connection.listen();
