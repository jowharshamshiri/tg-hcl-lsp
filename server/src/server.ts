import {
	createConnection,
	TextDocuments,
	ProposedFeatures,
	TextDocumentSyncKind,
	CompletionItem,
	TextDocumentChangeEvent,
	InitializeParams,
	DiagnosticSeverity,
	MarkupKind
} from 'vscode-languageserver/node';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';
import { ConfigEvaluator, ParsedDocument, Workspace, runtimeValueToPlain } from 'tghclparser';
import type { RuntimeValue, TerragruntConfig, TreeNode, ValueType } from 'tghclparser';

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

const evaluator = new ConfigEvaluator({
	environmentVariables: Object.fromEntries(
		Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
	),
	terraformCommand: '',
	terraformCliArgs: [],
	resolveDependency: async (configPath, name) => {
		const dependencies = await workspace.getDependencies(pathToFileURL(configPath).toString());
		const dependency = dependencies.find(candidate => candidate.parameterValue === name);
		if (!dependency) return undefined;
		let outputs = dependency.outputs;
		if (!outputs || outputs.size === 0) {
			const dependencyDocument = await workspace.getParsedDocument(dependency.uri);
			outputs = dependencyDocument ? await dependencyDocument.getAllOutputs() : undefined;
		}
		if (!outputs || outputs.size === 0) return undefined;
		return {
			type: 'object',
			value: new Map([['outputs', { type: 'object', value: outputs }]])
		} as RuntimeValue<ValueType>;
	}
});

function filePathFromUri(uri: string): string {
	if (!uri.startsWith('file:')) throw new Error(`Semantic evaluation requires a file URI: ${uri}`);
	return fileURLToPath(uri);
}

function evaluationRoot(uri: string): string {
	if (workspaceFolder?.startsWith('file:')) return filePathFromUri(workspaceFolder);
	return path.dirname(filePathFromUri(uri));
}

function evaluationDiagnostic(error: string) {
	return {
		severity: DiagnosticSeverity.Warning,
		range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
		message: `Configuration evaluation: ${error}`,
		source: 'terragrunt-evaluation'
	};
}

function valueMarkdown(value: RuntimeValue<ValueType>): string {
	const plain = runtimeValueToPlain(value);
	if (plain === null || typeof plain !== 'object') return `\`${String(plain).replace(/`/g, '\\`')}\``;
	return `\`\`\`json\n${JSON.stringify(plain, null, 2)}\n\`\`\``;
}

async function evaluateDocument(uri: string, content: string) {
	return evaluator.evaluateUnit(filePathFromUri(uri), content, evaluationRoot(uri));
}

async function handleDocumentChange(event: TextDocumentChangeEvent<TextDocument>) {
	try {
		const document = event.document;
		const parsedDocument = new ParsedDocument(workspace, document.uri, document.getText());
		parsedDocuments.set(document.uri, parsedDocument);

		await workspace.addDocument(parsedDocument);

		const diagnostics = [...parsedDocument.getDiagnostics()];
		if (diagnostics.every(diagnostic => diagnostic.severity !== DiagnosticSeverity.Error)) {
			const evaluation = await evaluateDocument(document.uri, document.getText());
			if (!evaluation.valid && evaluation.error) diagnostics.push(evaluationDiagnostic(evaluation.error));
		}
		connection.sendDiagnostics({
			uri: document.uri,
			diagnostics
		});
		connection.sendNotification('terragrunt/evaluatableRanges', {
			uri: document.uri,
			ranges: await evaluatableRanges(parsedDocument.getAST(), document)
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
		const evaluated = await evaluator.evaluateAtPosition(
			filePathFromUri(document.uri),
			document.getText(),
			evaluationRoot(document.uri),
			params.position
		);
		if (!hoverResult && !evaluated) {
			return null;
		}
		const base = hoverResult?.value ?? '';
		const valueSection = evaluated
			? runtimeValueToPlain(evaluated) === null || typeof runtimeValueToPlain(evaluated) !== 'object'
				? `⚡ ${valueMarkdown(evaluated)}\n\n---\n\n`
				: `⚡\n\n${valueMarkdown(evaluated)}\n\n---\n\n`
			: '';

		return {
			contents: {
				kind: MarkupKind.Markdown,
				value: `${valueSection}${base}`
			},
			// range: hoverResult.range
		};

	} catch (error) {
		connection.console.error(`[Server(${process.pid}) ${workspaceFolder}] Error while providing hover: ${error}`);
		return null;
	}
});

async function evaluatableRanges(ast: any, document: TextDocument): Promise<Array<{ start: { line: number; character: number }; end: { line: number; character: number } }>> {
	const nodes = new Map<string, { position: { line: number; character: number }; ranges: Array<{ start: { line: number; character: number }; end: { line: number; character: number } }> }>();
	const visit = (node: any): void => {
		const location = node?.location;
		if (node?.type === 'attribute' && location) {
			const identifier = node.children?.find((child: any) => child.type === 'attribute_identifier');
			const value = node.children?.find((child: any) => child.type !== 'attribute_identifier');
			if (identifier?.location && value?.location) {
				const position = document.positionAt(value.location.start.offset);
				const keyRange = {
					start: document.positionAt(identifier.location.start.offset),
					end: document.positionAt(identifier.location.end.offset)
				};
				nodes.set(`key:${identifier.location.start.offset}:${identifier.location.end.offset}`, { position, ranges: [keyRange] });
			}
		}
		if (location && ['function_call', 'reference', 'local_reference', 'dependency_reference', 'terraform_reference', 'interpolated_string', 'ternary_expression', 'string_lit', 'number_lit', 'boolean_lit', 'null_lit'].includes(node.type)) {
			const position = document.positionAt(location.start.offset);
			const end = document.positionAt(location.end.offset);
			nodes.set(`${location.start.offset}:${location.end.offset}`, { position, ranges: [{ start: position, end }] });
		}
		for (const child of node?.children ?? []) visit(child);
	};
	visit(ast);
const result = [];
	for (const { position, ranges } of nodes.values()) {
		const value = await evaluator.evaluateAtPosition(filePathFromUri(document.uri), document.getText(), evaluationRoot(document.uri), position);
		if (value) result.push(...ranges);
	}
	return result;
}

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
