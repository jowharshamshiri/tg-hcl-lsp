import * as assert from 'assert';
import * as vscode from 'vscode';
import { ensureActive, fixtureUri, openFixture, waitFor } from './helpers';

suite('Document links', () => {
	suiteSetup(ensureActive);

	test('a dependency config_path links to the unit it names', async () => {
		const document = await openFixture('app/terragrunt.hcl');
		const links = await waitFor(
			() => vscode.commands.executeCommand<vscode.DocumentLink[]>('vscode.executeLinkProvider', document.uri),
			answer => answer.length > 0
		);

		const link = links.find(candidate => document.getText(candidate.range) === '"../vpc"');
		assert.ok(link, `expected a link on the config_path string, got ${JSON.stringify(links)}`);
		assert.strictEqual(link.target?.fsPath, fixtureUri('vpc/terragrunt.hcl').fsPath);
	});
});
