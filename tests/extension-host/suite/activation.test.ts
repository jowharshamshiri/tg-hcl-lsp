import * as assert from 'assert';
import * as vscode from 'vscode';
import { EXTENSION_ID, ensureActive, openFixture, waitFor } from './helpers';

suite('Activation', () => {
	test('extension is present', () => {
		assert.ok(vscode.extensions.getExtension(EXTENSION_ID), `extension ${EXTENSION_ID} not found`);
	});

	test('extension activates', async () => {
		await ensureActive();
		assert.strictEqual(vscode.extensions.getExtension(EXTENSION_ID)!.isActive, true);
	});

	test('the dependency tree command is registered once a server is running', async () => {
		await ensureActive();
		// The language client registers the server's commands when it starts, which is when a configuration opens.
		await openFixture('vpc/terragrunt.hcl');
		const commands = await waitFor(
			() => vscode.commands.getCommands(true),
			answer => answer.includes('terragrunt.dependencyTree')
		);
		assert.ok(commands.includes('terragrunt.dependencyTree'));
	});
});
