import {
    createConnection,
    TextDocuments,
    Diagnostic,
    DiagnosticSeverity,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    Definition,
    Location,
    Range,
    Position,
    DocumentLink,
    DocumentLinkParams,
    Hover,
    SignatureHelp,
    SignatureInformation,
    ParameterInformation
} from 'vscode-languageserver/node';

import {
    TextDocument
} from 'vscode-languageserver-textdocument';

import { validBlocks, terragruntFunctions } from './terragruntDefinitions';

import * as path from 'path';
import * as fs from 'fs';
import { URI } from 'vscode-uri';

console.log('Terragrunt Language Server: Starting up');

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

function parseTerragruntHCL(text: string): any {
    const blocks: any = {};
    const regex = /(\w+)\s*{/g;
    const stack: any[] = [blocks];
    let match;
    let lastIndex = 0;

    try {
        while ((match = regex.exec(text)) !== null) {
            const blockName = match[1];
            const blockStart = match.index + match[0].length;
            let blockEnd = blockStart;
            let nestLevel = 1;

            for (let i = blockStart; i < text.length; i++) {
                if (text[i] === '{') nestLevel++;
                if (text[i] === '}') nestLevel--;
                if (nestLevel === 0) {
                    blockEnd = i;
                    break;
                }
            }

            if (nestLevel !== 0) {
                throw new Error(`Unmatched brackets in block "${blockName}"`);
            }

            const blockContent = text.slice(blockStart, blockEnd).trim();
            const currentLevel = stack[stack.length - 1];
            currentLevel[blockName] = parseTerragruntHCL(blockContent);
            stack.push(currentLevel[blockName]);

            lastIndex = blockEnd + 1;
        }

        // Capture any remaining content as a special '__content__' property
        if (lastIndex < text.length) {
            const remainingContent = text.slice(lastIndex).trim();
            if (remainingContent) {
                stack[stack.length - 1]['__content__'] = remainingContent;
            }
        }

        return blocks;
    } catch (error) {
        console.error('Error parsing Terragrunt HCL:', error);
        return {}; // Return an empty object in case of parsing error
    }
}

function getTerraformVariables(sourcePath: string): string[] {
    const variables: Set<string> = new Set();
    
    // Function to recursively search for .tf files
    function searchTerraformFiles(dirPath: string) {
        const files = fs.readdirSync(dirPath);
        
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isDirectory()) {
                searchTerraformFiles(filePath);
            } else if (path.extname(file) === '.tf') {
                const content = fs.readFileSync(filePath, 'utf8');
                extractVariables(content, variables);
            }
        }
    }
    
    // Function to extract variables from file content
    function extractVariables(content: string, variables: Set<string>) {
        const variableRegex = /variable\s+"([^"]+)"\s*{/g;
        let match;
        while ((match = variableRegex.exec(content)) !== null) {
            variables.add(match[1]);
        }
    }
    
    try {
        if (fs.existsSync(sourcePath)) {
            const stat = fs.statSync(sourcePath);
            if (stat.isDirectory()) {
                searchTerraformFiles(sourcePath);
            } else if (path.extname(sourcePath) === '.tf') {
                const content = fs.readFileSync(sourcePath, 'utf8');
                extractVariables(content, variables);
            }
        } else {
            console.warn(`Source path does not exist: ${sourcePath}`);
        }
    } catch (error) {
        console.error('Error parsing Terraform files:', error);
    }
    
    return Array.from(variables);
}

connection.onInitialize((params: InitializeParams) => {
    const capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.
    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    hasDiagnosticRelatedInformationCapability = !!(
        capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation
    );

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['.', '=', '"']
            },
            definitionProvider: true,
            documentLinkProvider: {
                resolveProvider: true
            },
            diagnosticProvider: {
                interFileDependencies: false,
                workspaceDiagnostics: false
            },
			hoverProvider: true,
			signatureHelpProvider: {
				triggerCharacters: ['(', ',']
			}
        }
    };
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true
            }
        };
    }
    return result;
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            connection.console.log('Workspace folder change event received.');
        });
    }
	console.log('Terragrunt Language Server: Initialization complete');
});

connection.onDefinition((params: TextDocumentPositionParams): Definition | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const text = document.getText();
    const blocks = parseTerragruntHCL(text);

    if (blocks.include) {
        const pathMatch = blocks.include.match(/path\s*=\s*"([^"]*)"/);
        if (pathMatch) {
            const includePath = pathMatch[1];
            const documentPath = path.dirname(params.textDocument.uri);
            const fullPath = path.resolve(documentPath, includePath);
            
            return Location.create(fullPath, Range.create(Position.create(0, 0), Position.create(0, 0)));
        }
    }

    return null;
});

interface TgLspSettings {
    maxNumberOfProblems: number;
}

const defaultSettings: TgLspSettings = { maxNumberOfProblems: 1000 };
let globalSettings: TgLspSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<TgLspSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        documentSettings.clear();
    } else {
        globalSettings = <TgLspSettings>(
            (change.settings.languageServerExample || defaultSettings)
        );
    }
    connection.languages.diagnostics.refresh();
});

function getDocumentSettings(resource: string): Thenable<TgLspSettings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'terragruntHclLanguageServer'
        });
        documentSettings.set(resource, result);
    }
    return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
});

connection.languages.diagnostics.on(async (params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return { kind: 'full', items: [] };
    }
  
    const diagnostics = await validateTerragruntHclDoc(document);
    return { kind: 'full', items: diagnostics };
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
    validateTerragruntHclDoc(change.document);
});

async function validateTerragruntHclDoc(hclDocument: TextDocument): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    const text = hclDocument.getText();

	let inHeredoc = false;
    let heredocIdentifier = '';
    let nestingLevel = 0;
    let inLocalBlock = false;
    let inArrayDefinition = false;
    let arrayBracketCount = 0;

    // Terragrunt-specific validation rules
    const rules: Array<{
        pattern: RegExp;
        message: string;
        validate?: (match: RegExpExecArray, fullText: string, lineIndex: number) => string | null;
        severity: DiagnosticSeverity;
    }> = [
        {
            // Updated pattern to be more specific
            pattern: /^(resource|data|module|variable|output)\s+"[^"]*"\s+"[^"]*"\s*{/gm,
            message: "Terragrunt files should not contain direct Terraform resource blocks. Use 'terraform' block instead.",
            validate: (match, fullText) => {
                // Check if this block is inside a generate block
                const generateBlockStart = fullText.lastIndexOf('generate', match.index);
                const generateBlockEnd = fullText.indexOf('}', generateBlockStart);
                if (generateBlockStart !== -1 && generateBlockEnd > match.index) {
                    return null; // It's inside a generate block, so it's valid
                }
                return "Terragrunt files should not contain direct Terraform resource blocks. Use 'terraform' block instead.";
            },
            severity: DiagnosticSeverity.Error
        },
        {
            pattern: /\bterraform\s*{[^}]*source\s*=\s*"([^"]+)"[^}]*}/g,
            message: "Terraform source should typically be a Git repository or a GitHub URL.",
            validate: (match: RegExpExecArray) => {
                const source = match[1];
                if (!source.startsWith("git::") && !source.startsWith("github.com/")) {
                    return "Terraform source should typically be a Git repository or a GitHub URL.";
                }
                return null;
            },
            severity: DiagnosticSeverity.Warning
        },
        {
            pattern: /\binclude\s*{[^}]*}/g,
            message: "Include block should specify a 'path' attribute.",
            validate: (match: RegExpExecArray) => {
                if (!match[0].includes("path =")) {
                    return "Include block should specify a 'path' attribute.";
                }
                return null;
            },
            severity: DiagnosticSeverity.Error
        },
		{
            pattern: /^([a-zA-Z_][a-zA-Z0-9_-]*(?:\s+"[^"]*")?)\s*{/gm,
            message: "Potential invalid block in Terragrunt configuration",
            validate: (match, fullText) => {
                const validBlocks = [
                    'terraform', 'include', 'locals', 'inputs', 'dependency',
                    'generate', 'remote_state', 'terraform_version_constraint',
                    'terragrunt_version_constraint', 'download_dir', 'skip'
                ];
				// Check if the match is inside a heredoc definition
				const heredocStartPattern = /<<(\w+)/g;
				let heredocMatch;
				while ((heredocMatch = heredocStartPattern.exec(fullText)) !== null) {
					const heredocIdentifier = heredocMatch[1];
					const heredocEndPattern = new RegExp(`^${heredocIdentifier}$`, 'm');
					const heredocEndIndex = fullText.indexOf(heredocIdentifier, heredocMatch.index + heredocIdentifier.length);
					if (heredocMatch.index < match.index && match.index < heredocEndIndex) {
						return null;
					}
				}

                const blockParts = match[1].trim().split(/\s+/);
                const blockName = blockParts[0];
                
                if (!validBlocks.includes(blockName)) {
                    return `Invalid block '${blockName}'. Valid blocks are: ${validBlocks.join(', ')}`;
                }
                
                // Special handling for blocks that can have arguments
                if (blockName === 'generate' || blockName === 'dependency') {
                    if (blockParts.length !== 2 || !blockParts[1].startsWith('"') || !blockParts[1].endsWith('"')) {
                        return `The '${blockName}' block should have a single string argument in quotes.`;
                    }
                } else if (blockName === 'include') {
                    if (blockParts.length == 2 && (!blockParts[1].startsWith('"') || !blockParts[1].endsWith('"'))) {
                        return `The '${blockName}' block can only have a single string argument in quotes.`;
                    }
                } else if (blockParts.length > 1) {
                    return `The '${blockName}' block should not have additional arguments.`;
                }
                
                return null;
            },
            severity: DiagnosticSeverity.Error
        },
		{
            pattern: /^.+$/gm,
            message: "Invalid content outside of blocks",
            validate: (match, fullText, lineIndex) => {
                const line = match[0].trim();
                
                // Check for heredoc start
                const heredocStart = line.match(/<<(\w+)/);
                if (heredocStart) {
                    inHeredoc = true;
                    heredocIdentifier = heredocStart[1];
                    return null;
                }
                
                // Check for heredoc end
                if (inHeredoc && line === heredocIdentifier) {
                    inHeredoc = false;
                    heredocIdentifier = '';
                    return null;
                }
                
                // Ignore content inside heredoc
                if (inHeredoc) return null;
                
                // Handle opening and closing brackets for array definitions
                arrayBracketCount += (line.match(/\[/g) || []).length;
                arrayBracketCount -= (line.match(/\]/g) || []).length;
                inArrayDefinition = arrayBracketCount > 0;
                
                // Handle closing braces
                if (line === '}' || line.endsWith('}]') || line.endsWith('},')) {
                    nestingLevel = Math.max(0, nestingLevel - 1);
                    if (nestingLevel === 0) {
                        inLocalBlock = false;
                    }
                    return null;
                }
                
                // Ignore comments, empty lines, and valid constructs
                if (line.startsWith('#') || line.startsWith('//') || line === '' || 
                    line.match(/^[a-zA-Z_][a-zA-Z0-9_-]*\s*=/) ||
                    line.match(/^[a-zA-Z_][a-zA-Z0-9_-]*(?:\s+"[^"]*")?\s*{/) || // Match generate blocks
                    line.match(/^\$\{.*\}$/) ||
                    line.match(/^[[\],{}]$/) || // Allow standalone brackets, braces, and commas
                    line.match(/^},?$/) || // Allow closing brace with optional comma
                    line.match(/^],?$/) || // Allow closing bracket with optional comma
                    line.match(/^"[^"]*"(,)?$/) || // Allow quoted strings with optional comma
                    inArrayDefinition || // Allow any content inside array definitions
                    (inLocalBlock && line.match(/^[a-zA-Z_][a-zA-Z0-9_-]*\s*=/))) {
                    return null;
                }
                
                // If we're inside a nested structure, don't flag as error
                if (nestingLevel > 0) {
                    return null;
                }
                
                return "Invalid content outside of blocks. All content should be within defined blocks.";
            },
            severity: DiagnosticSeverity.Error
        }
        // {
        //     pattern: /\binputs\s*=\s*{[^}]*}/g,
        //     message: "Use ':' instead of '=' for key-value pairs in 'inputs' block.",
        //     validate: (match: RegExpExecArray) => {
        //         if (match[0].includes("=")) {
        //             return "Use ':' instead of '=' for key-value pairs in 'inputs' block.";
        //         }
        //         return null;
        //     },
        //     severity: DiagnosticSeverity.Warning
        // }
    ];

    for (const rule of rules) {
        let match: RegExpExecArray | null;
        while ((match = rule.pattern.exec(text)) !== null) {
            let message = rule.message;
            if (rule.validate) {
                const validationMessage = rule.validate(match, text, hclDocument.positionAt(match.index).line);
                if (validationMessage) {
                    message = validationMessage;
                } else {
                    continue;  // Skip if validation passes
                }
            }
            
            diagnostics.push({
                severity: rule.severity,
                range: {
                    start: hclDocument.positionAt(match.index),
                    end: hclDocument.positionAt(match.index + match[0].length)
                },
                message: message,
                source: 'Terragrunt Validator'
            });
        }
    }

    return diagnostics;
}

connection.onDidChangeWatchedFiles(_change => {
    
});

connection.onCompletion(
    (params: TextDocumentPositionParams): CompletionItem[] => {
        const document = documents.get(params.textDocument.uri);
        if (!document) return [];

        const text = document.getText();
        const position = params.position;
        const line = text.split('\n')[position.line];

        let items: CompletionItem[] = [];

        // Existing completion logic
        if (line.includes('include') && line.includes('path')) {
            const documentPath = path.dirname(params.textDocument.uri);
            const directories = fs.readdirSync(documentPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            items = directories.map(dir => ({
                label: dir,
                kind: CompletionItemKind.Folder
            }));
        }

        if (line.includes('dependency') && line.includes('outputs')) {
            items = ['output1', 'output2', 'output3'].map(output => ({
                label: output,
                kind: CompletionItemKind.Value
            }));
        }

        if (line.includes('dependency') && line.includes('config_path')) {
            const documentPath = path.dirname(params.textDocument.uri);
            const directories = fs.readdirSync(documentPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            items = directories.map(dir => ({
                label: dir,
                kind: CompletionItemKind.Folder
            }));
        }

        if (line.includes('inputs')) {
            const blocks = parseTerragruntHCL(text);
            if (blocks.terraform && blocks.terraform.includes('source')) {
                const sourceMatch = blocks.terraform.match(/source\s*=\s*"([^"]*)"/);
                if (sourceMatch) {
                    const sourcePath = sourceMatch[1];
                    const variables = getTerraformVariables(sourcePath);
                    items = variables.map(variable => ({
                        label: variable,
                        kind: CompletionItemKind.Variable
                    }));
                }
            }
        }

        if (line.includes('remote_state') || line.includes('generate')) {
            const remoteStateKeys = ['backend', 'config', 'generate'];
            const generateKeys = ['path', 'if_exists', 'contents'];

            items = [...remoteStateKeys, ...generateKeys].map(key => ({
                label: key,
                kind: CompletionItemKind.Keyword
            }));
        }

        if (line.trim() === '' || line.trim().endsWith('{')) {
            items = items.concat(Object.keys(validBlocks).map(block => ({
                label: block,
                kind: CompletionItemKind.Keyword,
                detail: `Terragrunt ${block} block`,
                documentation: validBlocks[block].description
            })));
        }

        if (line.includes('${')) {
            items = items.concat(Object.keys(terragruntFunctions).map(func => ({
                label: func,
                kind: CompletionItemKind.Function,
                detail: `Terragrunt ${func} function`,
                documentation: terragruntFunctions[func].description
            })));
        }

        return items;
    }
);

connection.onCompletionResolve(
    (item: CompletionItem): CompletionItem => {
        if (item.data === 1) {
            item.detail = 'TypeScript details';
            item.documentation = 'TypeScript documentation';
        } else if (item.data === 2) {
            item.detail = 'JavaScript details';
            item.documentation = 'JavaScript documentation';
        }
        return item;
    }
);

// Implement directory suggestions for 'include' paths
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const text = document.getText();
    const position = params.position;
    const line = text.split('\n')[position.line];

    if (line.includes('include') && line.includes('path')) {
        const documentPath = path.dirname(params.textDocument.uri);
        const directories = fs.readdirSync(documentPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        return directories.map(dir => ({
            label: dir,
            kind: CompletionItemKind.Folder
        }));
    }

    // Implement 'dependency' output suggestions
    if (line.includes('dependency') && line.includes('outputs')) {
        // This is a placeholder. In a real scenario, you'd parse the referenced module's outputs.
        return ['output1', 'output2', 'output3'].map(output => ({
            label: output,
            kind: CompletionItemKind.Value
        }));
    }

    // Implement 'dependency' config_path suggestions
    if (line.includes('dependency') && line.includes('config_path')) {
        const documentPath = path.dirname(params.textDocument.uri);
        const directories = fs.readdirSync(documentPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        return directories.map(dir => ({
            label: dir,
            kind: CompletionItemKind.Folder
        }));
    }

    // Implement 'inputs' suggestions based on Terraform variables
    if (line.includes('inputs')) {
        const blocks = parseTerragruntHCL(text);
        if (blocks.terraform && blocks.terraform.includes('source')) {
            const sourceMatch = blocks.terraform.match(/source\s*=\s*"([^"]*)"/);
            if (sourceMatch) {
                const sourcePath = sourceMatch[1];
                const variables = getTerraformVariables(sourcePath);
                return variables.map(variable => ({
                    label: variable,
                    kind: CompletionItemKind.Variable
                }));
            }
        }
    }

    // Implement 'remote_state' and 'generate' key suggestions
    if (line.includes('remote_state') || line.includes('generate')) {
        const remoteStateKeys = ['backend', 'config', 'generate'];
        const generateKeys = ['path', 'if_exists', 'contents'];

        return [...remoteStateKeys, ...generateKeys].map(key => ({
            label: key,
            kind: CompletionItemKind.Keyword
        }));
    }

    return [];
});

connection.onDocumentLinks(
    (params: DocumentLinkParams): DocumentLink[] => {
        const document = documents.get(params.textDocument.uri);
        if (!document) return [];

        const text = document.getText();
        const links: DocumentLink[] = [];

        // Helper function to create a DocumentLink
        const createLink = (start: number, end: number, target: string): DocumentLink => ({
            range: {
                start: document.positionAt(start),
                end: document.positionAt(end)
            },
            target: target
        });

        // Function to resolve relative paths
        const resolvePath = (filePath: string, isRemoteState: boolean = false): string => {
            const documentUri = URI.parse(document.uri);
            const documentDir = path.dirname(documentUri.fsPath);
            
            let resolvedPath: string;
            if (path.isAbsolute(filePath)) {
                resolvedPath = filePath;
            } else {
                resolvedPath = path.resolve(documentDir, filePath);
            }
            
            if (isRemoteState) {
                const tfstatePath = path.join(resolvedPath, 'terraform.tfstate');
                if (fs.existsSync(tfstatePath)) {
                    return URI.file(tfstatePath).toString();
                }
                // If terraform.tfstate doesn't exist, return the directory path
                return URI.file(resolvedPath).toString();
            }
            
            // Check if the resolved path is a directory
            if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
                return URI.file(path.join(resolvedPath, 'terragrunt.hcl')).toString();
            }
            
            return URI.file(resolvedPath).toString();
        };

        // Create links for 'dependency' blocks
        const dependencyRegex = /dependency\s*"[^"]*"\s*{[^}]*config_path\s*=\s*"([^"]*)"/g;
        let match;
        while ((match = dependencyRegex.exec(text)) !== null) {
            const target = resolvePath(match[1]);
            links.push(createLink(match.index, match.index + match[0].length, target));
        }

        // Create links for 'include' blocks
        const includeRegex = /include\s*{[^}]*path\s*=\s*"([^"]*)"/g;
        while ((match = includeRegex.exec(text)) !== null) {
            const target = resolvePath(match[1]);
            links.push(createLink(match.index, match.index + match[0].length, target));
        }

        // Create links for 'terraform' source blocks
        const terraformSourceRegex = /terraform\s*{[^}]*source\s*=\s*"([^"]*)"/g;
        while ((match = terraformSourceRegex.exec(text)) !== null) {
            // For terraform sources, we don't append 'terragrunt.hcl'
            const target = path.isAbsolute(match[1]) ? match[1] : path.resolve(path.dirname(document.uri), match[1]);
            links.push(createLink(match.index, match.index + match[0].length, target));
        }

        // Create links for 'remote_state' blocks
        const remoteStateRegex = /remote_state\s*{[^}]*config\s*=\s*"([^"]*)"/g;
        while ((match = remoteStateRegex.exec(text)) !== null) {
            const target = resolvePath(match[1], true);
            links.push(createLink(match.index, match.index + match[0].length, target));
        }

        return links;
    }
);

connection.onHover((params: TextDocumentPositionParams): Hover | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const text = document.getText();
    const position = params.position;
    const word = getWordAtPosition(text, position);

    if (word in validBlocks) {
        return {
            contents: {
                kind: 'markdown',
                value: `**${word}** is a Terragrunt block used for ${validBlocks[word].description}.`
            }
        };
    }

    if (word in terragruntFunctions) {
        return {
            contents: {
                kind: 'markdown',
                value: `**${word}** is a Terragrunt function used for ${terragruntFunctions[word].description}.`
            }
        };
    }

    return null;
});

connection.onSignatureHelp((params: TextDocumentPositionParams): SignatureHelp | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const text = document.getText();
    const position = params.position;
    const line = text.split('\n')[position.line];
    const functionMatch = line.match(/(\w+)\(/);

    if (functionMatch && functionMatch[1] in terragruntFunctions) {
        const functionName = functionMatch[1];
        const funcDef = terragruntFunctions[functionName];
        return {
            signatures: [
                SignatureInformation.create(
                    `${functionName}(${funcDef.parameters.join(', ')})`,
                    funcDef.description,
                    ...funcDef.parameters.map(param => 
                        ParameterInformation.create(param, funcDef.parameterDescriptions[param] || 'No description available')
                    )
                )
            ],
            activeSignature: 0,
            activeParameter: getActiveParameter(line, position.character)
        };
    }

    return null;
});

// Helper functions (implement these based on your needs)
function getWordAtPosition(text: string, position: Position): string {
    const line = text.split('\n')[position.line];
    const beforeCursor = line.slice(0, position.character);
    const after = line.slice(position.character);
    const wordBefore = beforeCursor.match(/[A-Za-z0-9_-]+$/);
    const wordAfter = after.match(/^[A-Za-z0-9_-]+/);
    const wordBeforeStr = wordBefore ? wordBefore[0] : '';
    const wordAfterStr = wordAfter ? wordAfter[0] : '';
    return wordBeforeStr + wordAfterStr;
}

function getActiveParameter(line: string, position: number): number {
    const funcCallMatch = line.slice(0, position).match(/\w+\s*\(/);
    if (!funcCallMatch) return 0;
    
    const commaCount = line.slice(funcCallMatch.index, position).split(',').length - 1;
    return commaCount;
}

documents.listen(connection);

// Listen on the connection
connection.listen();