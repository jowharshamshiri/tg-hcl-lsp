import * as assert from 'assert';
import * as vscode from 'vscode';
import { ensureActive, openFixture, waitFor } from './helpers';

const OPTIONS: vscode.FormattingOptions = { tabSize: 2, insertSpaces: true };

function formatEdits(document: vscode.TextDocument): Thenable<vscode.TextEdit[] | undefined> {
	return vscode.commands.executeCommand<vscode.TextEdit[] | undefined>('vscode.executeFormatDocumentProvider', document.uri, OPTIONS);
}

suite('Formatting', () => {
	suiteSetup(ensureActive);

	test('a badly laid out file is formatted', async () => {
		const document = await openFixture('unformatted/terragrunt.hcl');
		const edits = await waitFor(() => formatEdits(document), answer => (answer?.length ?? 0) > 0);
		assert.ok(edits && edits.length > 0, 'expected formatting edits');

		const edit = new vscode.WorkspaceEdit();
		edit.set(document.uri, edits);
		await vscode.workspace.applyEdit(edit);

		assert.strictEqual(document.getText(), 'locals {\n  env    = "dev"\n  region = "eu-west-2"\n}\n');
		await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
	});

	test('a file with a syntax error is left as it is', async () => {
		const document = await openFixture('invalid/terragrunt.hcl');
		// The server is up once the file's problems are in, so an empty answer is the server's own.
		await waitFor(async () => vscode.languages.getDiagnostics(document.uri), answer => answer.length > 0);

		const edits = await formatEdits(document);
		assert.ok(!edits || edits.length === 0, `expected no edits, got ${JSON.stringify(edits)}`);
	});
});
