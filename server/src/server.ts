import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    TextDocumentSyncKind,
    CompletionItem,
    TextDocumentChangeEvent,
    InitializeParams,
    DocumentLink
} from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';

import {
    TextDocument
} from 'vscode-languageserver-textdocument';
import { HoverProvider, CompletionsProvider, DiagnosticsProvider, ParsedDocument, Workspace, Token } from 'tghclparser';

// Creates the LSP connection
const connection = createConnection(ProposedFeatures.all);

// Create a manager for open text documents
const documents = new TextDocuments(TextDocument);

// Create a workspace instance
const workspace = new Workspace();

// Store parsed documents by URI
const parsedDocuments = new Map<string, ParsedDocument>();

// The workspace folder this server is operating on
let workspaceFolder: string | null;

async function handleDocumentChange(event: TextDocumentChangeEvent<TextDocument>) {
    try {
        const document = event.document;
        const parsedDocument = new ParsedDocument(workspace, document.uri, document.getText());
        parsedDocuments.set(document.uri, parsedDocument);

        // Add the document to workspace to process dependencies
        await workspace.addDocument(parsedDocument);

        // Send diagnostics after dependencies are processed
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
            }
        }
    };
});

connection.onHover((params) => {
    try {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            return null;
        }

        const parsedDocument = parsedDocuments.get(document.uri);
        if (!parsedDocument) {
            return null;
        }

        const hoverResult = parsedDocument.getHoverInfo(params.position);
        if (!hoverResult) {
            return null;
        }

        return {
            contents: hoverResult.content
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