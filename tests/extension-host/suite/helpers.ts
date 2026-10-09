import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

export const EXTENSION_ID = 'bahramjoharshamshiri.hcl-lsp';

// __dirname is <repo>/out-test/suite when the suite runs.
const FIXTURES = path.resolve(__dirname, '..', '..', 'tests', 'fixtures');

export function fixtureUri(relativePath: string): vscode.Uri {
	return vscode.Uri.file(path.join(FIXTURES, relativePath));
}

export async function ensureActive(): Promise<void> {
	const extension = vscode.extensions.getExtension(EXTENSION_ID);
	assert.ok(extension, `extension ${EXTENSION_ID} not found`);
	if (!extension.isActive) await extension.activate();
}

export async function openFixture(relativePath: string): Promise<vscode.TextDocument> {
	const document = await vscode.workspace.openTextDocument(fixtureUri(relativePath));
	await vscode.window.showTextDocument(document);
	assert.strictEqual(document.languageId, 'terragrunt');
	return document;
}

// The language client starts when the first document opens, so requests made before the server is up come back
// empty. Asks again until the answer satisfies `done` or the time runs out, and returns the last answer either way.
export async function waitFor<T>(ask: () => Thenable<T>, done: (answer: T) => boolean, timeoutMs = 15_000): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	let answer = await ask();
	while (!done(answer) && Date.now() < deadline) {
		await new Promise(resolve => setTimeout(resolve, 200));
		answer = await ask();
	}
	return answer;
}

// Resolves with a document's problems once the server has published them.
export function waitForDiagnostics(uri: vscode.Uri, timeoutMs = 15_000): Promise<vscode.Diagnostic[]> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			subscription.dispose();
			reject(new Error(`no diagnostics published for ${uri.fsPath}`));
		}, timeoutMs);
		const subscription = vscode.languages.onDidChangeDiagnostics(event => {
			if (!event.uris.some(changed => changed.toString() === uri.toString())) return;
			clearTimeout(timer);
			subscription.dispose();
			resolve(vscode.languages.getDiagnostics(uri));
		});
	});
}
