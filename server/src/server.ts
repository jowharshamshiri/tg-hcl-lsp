import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    TextDocumentSyncKind,
    CompletionItem,
    TextDocumentChangeEvent,
    InitializeParams
} from 'vscode-languageserver/node';

import {
    TextDocument
} from 'vscode-languageserver-textdocument';
import { HoverProvider, CompletionsProvider, DiagnosticsProvider, ParsedDocument } from 'tghclparser';

// Creates the LSP connection
const connection = createConnection(ProposedFeatures.all);

// Create a manager for open text documents
const documents = new TextDocuments(TextDocument);

// Listen to the connection
documents.listen(connection);

// Store parsed documents by URI
const parsedDocuments = new Map<string, ParsedDocument>();

// The workspace folder this server is operating on
let workspaceFolder: string | null;

// Handle document opening
documents.onDidOpen((event) => {
    // connection.console.log(`[Server(${process.pid}) ${workspaceFolder}] Document opened: ${event.document.uri}`);
    handleDocumentChange(event);
});

// Handle document changes
documents.onDidChangeContent((event) => {
    // connection.console.log(`[Server(${process.pid}) ${workspaceFolder}] Document changed: ${event.document.uri}`);
    handleDocumentChange(event);
});

// Handle document closing
documents.onDidClose((event) => {
    // connection.console.log(`[Server(${process.pid}) ${workspaceFolder}] Document closed: ${event.document.uri}`);
    parsedDocuments.delete(event.document.uri);
});

function handleDocumentChange(event: TextDocumentChangeEvent<TextDocument>) {
    try {
        const document = event.document;
        const parsedDocument = new ParsedDocument(document.uri, document.getText());
        parsedDocuments.set(document.uri, parsedDocument);

        // Send diagnostics
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
    // connection.console.log(`[Server(${process.pid}) ${workspaceFolder}] Started and initialize received`);

    // Parse all currently open documents
    documents.all().forEach(document => {
        try {
            const parsedDocument = new ParsedDocument(document.uri, document.getText());
            parsedDocuments.set(document.uri, parsedDocument);
            
            // Send initial diagnostics
            const diagnostics = parsedDocument.getDiagnostics();
            connection.sendDiagnostics({
                uri: document.uri,
                diagnostics
            });
        } catch (error) {
            connection.console.error(
                `[Server(${process.pid}) ${workspaceFolder}] Error parsing document during initialization: ${error}`
            );
        }
    });

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

        // connection.console.log(`[Server(${process.pid}) ${workspaceFolder}] Completion result: ${result.length} items`);
        return result;
    } catch (error) {
        connection.console.error(`[Server(${process.pid}) ${workspaceFolder}] Error while providing completions: ${error}`);
        return [];
    }
});

connection.listen();