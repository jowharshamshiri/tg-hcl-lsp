import {
	createConnection,
	TextDocuments,
	ProposedFeatures,
	TextDocumentSyncKind,
	CompletionItem,
	CompletionItemKind,
	InitializeParams,
	DiagnosticSeverity,
	FileChangeType,
	LocationLink,
	MarkupKind,
	Position,
	Range,
	TextEdit
} from 'vscode-languageserver/node';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';
import { ConfigEvaluator, formatHcl, HclSyntaxError, LocatedWorkspaceError, ParsedDocument, Workspace, runtimeValueToPlain } from 'tghclparser';
import type { ConfigEvaluationResult, EvaluatedSpan, RuntimeValue, TerragruntConfig, Token, TreeNode, ValueType } from 'tghclparser';

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
let workspaceTrusted = false;

const evaluator = new ConfigEvaluator({
	environmentVariables: Object.fromEntries(
		Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
	),
	terraformCommand: '',
	terraformCliArgs: [],
	workspaceTrusted: false,
	// The evaluator has found the dependency block in the unit's merged configuration and resolved config_path. Its
	// outputs are the state outputs of the configuration the request names; one with none -- never applied, or
	// state the server cannot read -- is unresolved, which is not reported as a problem.
	resolveDependency: async request => {
		const target = await workspace.getParsedDocument(pathToFileURL(request.targetConfigPath).toString());
		if (!target) throw new Error(`dependency "${request.name}": ${request.targetConfigPath} could not be loaded`);
		const outputs = await target.getAllOutputs();
		if (outputs.size === 0) return undefined;
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
	if (workspaceFolder?.startsWith('file:')) {
		const root = filePathFromUri(workspaceFolder);
		try {
			if (fs.statSync(root).isFile()) return path.dirname(root);
		} catch {
			return path.dirname(root);
		}
		return root;
	}
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

async function evaluateDocument(uri: string, content: string): Promise<ConfigEvaluationResult> {
	if (!workspaceTrusted) {
		return { valid: false, inputs: null, error: 'Semantic evaluation is disabled until the workspace is trusted' };
	}
	// Only a unit is evaluated for diagnostics. An included configuration such as root.hcl, evaluated on its own, has
	// none of the context its units give it -- their directory, their dependency blocks -- so its failures there say
	// nothing about the configuration Terragrunt runs.
	if (path.basename(filePathFromUri(uri)) !== 'terragrunt.hcl') return { valid: true, inputs: null };
	return evaluator.evaluateUnit(filePathFromUri(uri), content, evaluationRoot(uri));
}

// The check whose result is a document's problems. Checking the document again, or forgetting it, retires the check
// that was running, so a result that arrives late is not reported over what replaced it.
const checks = new Map<string, object>();

// Problems are only reported for open documents, and VS Code keeps a file's problems until they are replaced.
function forgetDocument(uri: string) {
	checks.delete(uri);
	parsedDocuments.delete(uri);
	workspace.removeDocument(uri);
	connection.sendDiagnostics({ uri, diagnostics: [] });
}

async function handleDocumentChange(document: TextDocument) {
	const check = {};
	checks.set(document.uri, check);
	const isCurrent = () => checks.get(document.uri) === check;
	try {
		const parsedDocument = new ParsedDocument(workspace, document.uri, document.getText());
		parsedDocuments.set(document.uri, parsedDocument);

		await workspace.addDocument(parsedDocument);
		// A document forgotten while it was being added is not left behind in the workspace.
		if (!checks.has(document.uri)) workspace.removeDocument(document.uri);

		const diagnostics = [...parsedDocument.getDiagnostics()];
		if (diagnostics.every(diagnostic => diagnostic.severity !== DiagnosticSeverity.Error)) {
			const evaluation = await evaluateDocument(document.uri, document.getText());
			// A value that cannot be known yet, such as a dependency never applied, is not a problem in the
			// configuration, so it is not reported as one.
			if (!evaluation.valid && evaluation.error && !evaluation.unresolved) diagnostics.push(evaluationDiagnostic(evaluation.error));
		}
		// A document closed, deleted or edited while it was evaluated has had its problems cleared or is being
		// checked again.
		if (!isCurrent()) return;
		connection.sendDiagnostics({
			uri: document.uri,
			diagnostics
		});
		await publishEvaluatableRanges(document);
	} catch (error) {
		connection.console.error(
			`[Server(${process.pid}) ${workspaceFolder}] Error handling document change: ${error}`
		);
		if (!isCurrent()) return;
		// A path that cannot be resolved is underlined where it is written. Written in a configuration this one
		// includes, it is still this unit's problem: it stays on the first line, and points at the path.
		const located = error instanceof LocatedWorkspaceError ? error : undefined;
		const here = located?.uri === document.uri;
		connection.sendDiagnostics({
			uri: document.uri,
			diagnostics: [{
				severity: 1,
				range: located && here ? located.range : { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
				message: error instanceof Error ? error.message : String(error),
				source: 'terragrunt-workspace',
				...(located && !here
					? { relatedInformation: [{ location: { uri: located.uri, range: located.range }, message: 'The path is written here' }] }
					: {})
			}]
		});

	}
}

connection.onInitialize((params: InitializeParams) => {
	workspaceFolder = params.rootUri;
	const initializationOptions = params.initializationOptions as { isWorkspaceTrusted?: unknown } | undefined;
	workspaceTrusted = initializationOptions?.isWorkspaceTrusted === true;
	evaluator.setWorkspaceTrusted(workspaceTrusted);
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
			definitionProvider: true,
			completionProvider: {
				resolveProvider: false,
				triggerCharacters: ['.', '=', ' ', '$', '{', '"', '/']
			},
			documentLinkProvider: {
				resolveProvider: true
			},
			// terragrunt.dependencyTree is handled, but not advertised: the language client registers an advertised
			// command with VS Code, which allows one registration per name, and the extension runs a server per
			// workspace folder plus one for files outside them. The extension registers the command itself.
			documentFormattingProvider: true
		}
	};
});

connection.onNotification('terragrunt/workspaceTrustChanged', (params: { isTrusted: boolean }) => {
	workspaceTrusted = params.isTrusted === true;
	evaluator.setWorkspaceTrusted(workspaceTrusted);
	if (workspaceTrusted) {
		void Promise.all(documents.all().map(document => handleDocumentChange(document)));
	}
});

connection.onExecuteCommand(async (params) => {
	if (params.command === 'terragrunt.dependencyTree') {
		if (!workspaceTrusted) {
			connection.sendNotification('terragrunt/dependencyTreeResult', {
				result: 'The dependency graph is disabled until the workspace is trusted.'
			});
			return;
		}
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
		const evaluated = narrowestSpanAt(await evaluatedSpans(document), document.offsetAt(params.position))?.value;
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

// The spans whose values are worth revealing: literals that already read as their value are left out by the evaluator.
async function evaluatedSpans(document: TextDocument): Promise<EvaluatedSpan[]> {
	if (!workspaceTrusted) return [];
	return evaluator.evaluatedSpans(filePathFromUri(document.uri), document.getText(), evaluationRoot(document.uri));
}

// The narrowest span under the cursor, so a hover shows the value its underline stands for.
function narrowestSpanAt(spans: EvaluatedSpan[], offset: number): EvaluatedSpan | undefined {
	let narrowest: EvaluatedSpan | undefined;
	for (const span of spans) {
		if (span.start <= offset && offset < span.end && (!narrowest || span.end - span.start < narrowest.end - narrowest.start)) {
			narrowest = span;
		}
	}
	return narrowest;
}

async function publishEvaluatableRanges(document: TextDocument) {
	const { uri, version } = document;
	const spans = await evaluatedSpans(document);
	// Documents are updated in place, so an edit or close while the file was evaluated leaves these offsets stale.
	// The newer text publishes its own ranges.
	if (documents.get(uri)?.version !== version) return;
	// Only expressions are marked. An attribute name's value is the one of the expression beside it, so marking both
	// would mark every value twice; names still answer hovers from the full set of spans.
	connection.sendNotification('terragrunt/evaluatableRanges', {
		uri,
		version,
		ranges: spans
			.filter(span => span.kind === 'expression')
			.map(span => ({ start: document.positionAt(span.start), end: document.positionAt(span.end) }))
	});
}

connection.onCompletion(async (params): Promise<CompletionItem[]> => {
	try {
		const document = documents.get(params.textDocument.uri);
		if (!document) {
			return [];
		}

		let parsedDocument = parsedDocuments.get(document.uri);
		if (!parsedDocument) {
			parsedDocument = new ParsedDocument(workspace, document.uri, document.getText());
			parsedDocuments.set(document.uri, parsedDocument);
		}

		const result = await parsedDocument.getCompletionsAtPosition(params.position);
		if (!result) {
			return [];
		}

		// '/' triggers only for path segments; elsewhere it is division and shouldn't pop up suggestions.
		if (params.context?.triggerCharacter === '/') {
			return result.filter(item => item.kind === CompletionItemKind.Folder);
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

		return await parsedDocument.getLinks();
    } catch (error) {
        connection.console.error(`Error providing document links: ${error}`);
        return null;
    }
});

function containsPosition(token: Token, position: Position): boolean {
	const { startPosition: start, endPosition: end } = token;
	if (position.line < start.line || position.line > end.line) return false;
	if (position.line === start.line && position.character < start.character) return false;
	return !(position.line === end.line && position.character > end.character);
}

// The innermost reference the cursor is in, whichever of its parts the cursor is on. The whole tree is searched rather
// than following findTokenAtPosition, because the literal parts of an interpolated string span the whole string and
// would hide a reference written inside `${...}`.
function referenceAt(document: ParsedDocument, position: Position): Token | undefined {
	let found: Token | undefined;
	const visit = (token: Token) => {
		if (!containsPosition(token, position)) return;
		if (token.type === 'local_reference' || token.type === 'dependency_reference' || token.type === 'reference') found = token;
		token.children.forEach(visit);
	};
	document.getTokens().forEach(visit);
	return found;
}

function referenceChain(reference: Token): string[] {
	const chain = reference.children.find(child => child.type === 'access_chain');
	return chain?.children.filter(child => child.type === 'reference_identifier').map(child => child.getDisplayText()) ?? [];
}

function rootBlocks(document: ParsedDocument, type: string): Token[] {
	return document.getTokens()[0]?.children.filter(child => child.type === 'block' && child.value === type) ?? [];
}

function blockLabel(block: Token): string | undefined {
	return block.children.find(child => child.type === 'parameter')?.getDisplayText();
}

function tokenRange(token: Token): Range {
	return { start: token.startPosition, end: token.endPosition };
}

// The attribute is the target; its name is what the editor selects.
function attributeLink(origin: Token, document: ParsedDocument, attribute: Token): LocationLink {
	return LocationLink.create(document.getUri(), tokenRange(attribute), tokenRange(attribute.children[0] ?? attribute), tokenRange(origin));
}

function namedAttribute(owner: Token | undefined, name: string): Token | undefined {
	return owner?.children.find(child => child.type === 'attribute' && child.value === name);
}

function localDefinition(document: ParsedDocument, name: string): Token | undefined {
	for (const block of rootBlocks(document, 'locals')) {
		const attribute = namedAttribute(block, name);
		if (attribute) return attribute;
	}
	return undefined;
}

// Include paths are resolved from the configuration that writes them, as Terragrunt resolves a unit's own includes.
async function includedDocuments(document: ParsedDocument): Promise<{ name: string | undefined, document: ParsedDocument }[]> {
	const ast = document.getAST();
	if (!ast) return [];
	const included: { name: string | undefined, document: ParsedDocument }[] = [];
	for (const include of document.findIncludeBlocks(ast)) {
		const target = await workspace.getParsedDocument(await workspace.resolveIncludePath(include.path, document.getUri()));
		if (target) included.push({ name: blockLabel(include.block), document: target });
	}
	return included;
}

// include.<name>.locals.<local> and include.<name>.inputs.<key> lead to where the included configuration sets them;
// any other part of an include, or one it does not set literally, leads to the included file.
async function includeDefinition(origin: Token, document: ParsedDocument, chain: string[]): Promise<LocationLink | undefined> {
	const [name, section, key] = chain;
	const included = (await includedDocuments(document)).find(candidate => candidate.name === name)?.document;
	if (!included) return undefined;
	const attribute = key === undefined
		? undefined
		: section === 'locals'
			? localDefinition(included, key)
			: section === 'inputs'
				? namedAttribute(included.getInputsAssignment()?.children[1], key)
				: undefined;
	if (attribute) return attributeLink(origin, included, attribute);
	const start: Range = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
	return LocationLink.create(included.getUri(), start, start, tokenRange(origin));
}

// Terragrunt merges the dependency blocks of included configurations into the unit, so a dependency the unit does not
// declare itself is looked for in what it includes.
async function dependencyDefinition(origin: Token, document: ParsedDocument, name: string): Promise<LocationLink | undefined> {
	for (const candidate of [document, ...(await includedDocuments(document)).map(include => include.document)]) {
		const block = rootBlocks(candidate, 'dependency').find(dependency => blockLabel(dependency) === name);
		if (block) return LocationLink.create(candidate.getUri(), tokenRange(block), tokenRange(block.children.find(child => child.type === 'parameter') ?? block), tokenRange(origin));
	}
	return undefined;
}

connection.onDefinition(async (params) => {
	try {
		const parsedDocument = parsedDocuments.get(params.textDocument.uri);
		if (!parsedDocument) {
			return null;
		}

		const reference = referenceAt(parsedDocument, params.position);
		if (!reference) {
			return null;
		}

		let target: LocationLink | undefined;
		if (reference.type === 'local_reference') {
			const name = referenceChain(reference)[0];
			const attribute = name === undefined ? undefined : localDefinition(parsedDocument, name);
			target = attribute && attributeLink(reference, parsedDocument, attribute);
		} else if (reference.type === 'dependency_reference') {
			// The grammar puts the dependency's name first, ahead of the access chain.
			const name = reference.children[0]?.getDisplayText();
			target = name === undefined ? undefined : await dependencyDefinition(reference, parsedDocument, name);
		} else if (reference.value === 'include') {
			target = await includeDefinition(reference, parsedDocument, referenceChain(reference));
		}
		return target ? [target] : null;
	} catch (error) {
		connection.console.error(`[Server(${process.pid}) ${workspaceFolder}] Error while providing definition: ${error}`);
		return null;
	}
});

// Formatting is the parser's own: the layout `terragrunt hcl format` produces, with no CLI to install or run. It
// reads nothing but the text it is given, so it works in Restricted Mode too.
connection.onDocumentFormatting((params) => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return null;
	}
	const text = document.getText();
	try {
		// The name is what a message that points back at an earlier part of the file calls it: its path, or its URI
		// for a document that is not a file yet.
		const formatted = formatHcl(text, document.uri.startsWith('file:') ? fileURLToPath(document.uri) : document.uri);
		if (formatted === text) {
			return [];
		}
		return [TextEdit.replace({ start: document.positionAt(0), end: document.positionAt(text.length) }, formatted)];
	} catch (error) {
		// A file that does not parse is left as it is, as Terragrunt leaves it; the syntax error is already among
		// its problems. Anything else is a defect and fails the request.
		if (!(error instanceof HclSyntaxError)) throw error;
		connection.console.error(`${document.uri} was not formatted: ${error.message}`);
		return null;
	}
});

// Handle document events
documents.onDidOpen(async (event) => {
	await handleDocumentChange(event.document);
});

documents.onDidChangeContent(async (event) => {
	await handleDocumentChange(event.document);
});

documents.onDidClose((event) => {
	forgetDocument(event.document.uri);
});

// A deleted file stays open in VS Code, marked as deleted, so no close arrives for it. Deleting a folder is reported
// once, for the folder, so every open document below it goes with it.
connection.onDidChangeWatchedFiles((params) => {
	for (const change of params.changes) {
		if (change.type !== FileChangeType.Deleted) continue;
		const below = change.uri.endsWith('/') ? change.uri : `${change.uri}/`;
		forgetDocument(change.uri);
		for (const document of documents.all()) {
			if (document.uri.startsWith(below)) forgetDocument(document.uri);
		}
	}
});

// Listen on the documents and connection
documents.listen(connection);
connection.listen();
