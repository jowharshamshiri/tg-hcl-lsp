import * as assert from 'assert';
import * as vscode from 'vscode';
import { ensureActive, fixtureUri, openFixture, waitFor } from './helpers';

suite('Dependency lock file', () => {
	suiteSetup(ensureActive);

	test('is not Terragrunt configuration, and its provider blocks are not problems', async () => {
		// The unit beside the lock file is opened first, so a server for the folder is running when the lock file is.
		const unit = await openFixture('app/terragrunt.hcl');
		await waitFor(
			() => vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', unit.uri, new vscode.Position(0, 1)),
			answer => answer.length > 0
		);

		const lockFile = await vscode.workspace.openTextDocument(fixtureUri('app/.terraform.lock.hcl'));
		await vscode.window.showTextDocument(lockFile);
		assert.strictEqual(lockFile.languageId, 'hcl');

		// Checked as Terragrunt, each provider block is a problem within moments. Given three seconds, none comes.
		const problems = await waitFor(async () => vscode.languages.getDiagnostics(lockFile.uri), answer => answer.length > 0, 3_000);
		assert.deepStrictEqual(problems, []);
	});
});
