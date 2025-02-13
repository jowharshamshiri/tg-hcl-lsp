import {
	createConnection,
	TextDocuments,
	ProposedFeatures,
	TextDocumentSyncKind,
	CompletionItem,
	TextDocumentChangeEvent,
	InitializeParams,
	DocumentLink,
	MarkupKind,
	Range,
	Position
} from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';
import { HoverProvider, CompletionsProvider, DiagnosticsProvider, ParsedDocument, Workspace, Token } from 'tghclparser';

const connection = createConnection(ProposedFeatures.all);

const documents = new TextDocuments(TextDocument);

const workspace = new Workspace();

const parsedDocuments = new Map<string, ParsedDocument>();

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
                triggerCharacters: ['.', '=', ' ']
            },
            documentLinkProvider: {
                resolveProvider: true
            },
            executeCommandProvider: {
                commands: ['terragrunt.evaluateFunction']
            },
            codeLensProvider: {
                resolveProvider: false
            },
            // codeActionProvider: {
            //     codeActionKinds: [CodeActionKind.QuickFix]
            // }
        }
    };
});

connection.onCodeLens(async (params) => {
    try {
        const document = documents.get(params.textDocument.uri);
        if (!document) return [];

        const parsedDocument = parsedDocuments.get(document.uri);
        if (!parsedDocument) return [];

        const codeLenses = [];
        const tokens = parsedDocument.getTokens();

        // Recursive function to traverse token tree
        function findFunctionCalls(token: Token) {
            if (token.type === 'function_call') {
                codeLenses.push({
                    range: {
                        start: token.location.start,
                        end: token.location.end
                    },
                    command: {
						title: `▶ ${token.value}`,
                        command: 'terragrunt.evaluateFunction',
                        arguments: [{
                            function: token.value,
                            uri: document.uri,
                            position: token.location.start
                        }]
                    }
                });
            }

            // Recursively process all children
            if (token.children && token.children.length > 0) {
                token.children.forEach(child => findFunctionCalls(child));
            }
        }

        // Process all top-level tokens
        tokens.forEach(token => findFunctionCalls(token));
        
        return codeLenses;
    } catch (error) {
        connection.console.error(`Error providing code lenses: ${error}`);
        console.log('Stack trace:', error.stack);
        return [];
    }
});

connection.onExecuteCommand(async (params) => {
    if (params.command === 'terragrunt.evaluateFunction') {
        try {
            console.log('Evaluating function:', params);
            const args = params.arguments?.[0] || {};
            const { function: funcName, uri, position } = args;

            const document = documents.get(uri);
            if (!document) {
                console.log('Document not found:', uri);
                return null;
            }

            const parsedDocument = parsedDocuments.get(uri);
            if (!parsedDocument) {
                console.log('Parsed document not found:', uri);
                return null;
            }

            // Find the function call token at the position
            const token = parsedDocument.findTokenAtPosition(position);
            if (!token) {
                console.log('Token not found at position:', position);
                return null;
            }

            // Find the function call - either the token itself or its parent
            const functionCall = token.type === 'function_call' ? token : 
                               token.children?.find(child => child.type === 'function_call');
            
            if (!functionCall || functionCall.type !== 'function_call') {
                console.log('Function call not found for token:', token);
                return null;
            }

            // Evaluate function with its arguments
            const result = await parsedDocument.evaluateValue(functionCall);
			console.log('Function evaluation result:', result);

            // Send the result back as a notification that the client can display
            connection.sendNotification('terragrunt/functionEvaluation', {
                function: funcName,
                result: result ? JSON.stringify(result, null, 2) : 'Unable to evaluate function'
            });

        } catch (error) {
            connection.console.error(`Error evaluating function: ${error}`);
            console.log('Stack trace:', error.stack);
            connection.sendNotification('terragrunt/functionEvaluation', {
                function: params.arguments?.[0]?.function || 'unknown',
                result: `Error: ${error instanceof Error ? error.message : String(error)}`
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
        console.log('Stack trace:', error.stack);
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
connection.onDocumentLinks((params) => {
	try {
		const document = documents.get(params.textDocument.uri);
		if (!document) {
			return null;
		}

		const parsedDocument = parsedDocuments.get(document.uri);
		if (!parsedDocument) {
			return null;
		}

		// Get all dependency blocks
		const links: DocumentLink[] = [];
		const tokens = parsedDocument.getTokens();

		const findConfigPaths = (token: Token) => {
			if (token.type === 'string_lit' &&
				token.parent?.type === 'attribute' &&
				token.parent.value === 'config_path' &&
				token.parent.parent?.type === 'block' &&
				(token.parent.parent.value === 'dependency' || token.parent.parent.value === 'dependencies')) {

				const targetPath = workspace.resolveDependencyPath(token.value as string, URI.parse(document.uri).fsPath);
				const targetUri = URI.file(targetPath).toString();

				links.push({
					range: {
						start: token.startPosition,
						end: token.endPosition
					},
					target: targetUri
				});
			}

			// Recursively process children
			token.children.forEach(findConfigPaths);
		};

		tokens.forEach(findConfigPaths);
		return links;
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
});

// Listen on the documents and connection
documents.listen(connection);
connection.listen();