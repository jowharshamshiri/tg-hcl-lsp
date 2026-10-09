import * as assert from 'assert';
import * as vscode from 'vscode';
import { ensureActive, openFixture, waitFor } from './helpers';

suite('One server for each file', () => {
	suiteSetup(ensureActive);

	test('a file in the folder is served once while an untitled file has a server of its own', async () => {
		// An untitled file is served by a server with no folder. It is up once it completes.
		const untitled = await vscode.workspace.openTextDocument({ language: 'terragrunt', content: '' });
		await vscode.window.showTextDocument(untitled);
		const list = await waitFor(
			() => vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', untitled.uri, new vscode.Position(0, 0)),
			answer => answer.items.some(item => item.label === 'include')
		);
		assert.ok(list.items.some(item => item.label === 'include'), 'the untitled file has no server');

		// A file of the folder has one syntax error. Were both servers to check it, it would be reported twice.
		const document = await openFixture('invalid/terragrunt.hcl');
		const errors = () => vscode.languages.getDiagnostics(document.uri).filter(problem => problem.severity === vscode.DiagnosticSeverity.Error);
		await waitFor(async () => errors(), answer => answer.length > 0);
		const settled = await waitFor(async () => errors(), answer => answer.length > 1, 3_000);
		assert.strictEqual(settled.length, 1, `expected one error, got ${JSON.stringify(settled)}`);
	});
});
