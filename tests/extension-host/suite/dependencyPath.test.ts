import * as assert from 'assert';
import * as vscode from 'vscode';
import { ensureActive, openFixture, waitFor } from './helpers';

suite('Completion of a dependency path', () => {
	suiteSetup(ensureActive);

	test('lists the directories at the path, with units first and other directories to step into', async () => {
		const document = await openFixture('completes/terragrunt.hcl');
		// Just after the slash of `config_path = "../"`.
		const position = new vscode.Position(1, document.lineAt(1).text.indexOf('../') + 3);
		const list = await waitFor(
			() => vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', document.uri, position, '/'),
			answer => answer.items.some(item => item.label === 'vpc')
		);
		const items = new Map(list.items.map(item => [typeof item.label === 'string' ? item.label : item.label.label, item]));

		// A directory holding a unit completes as it is and says what it is.
		assert.strictEqual(items.get('vpc')?.detail, 'Terragrunt unit');
		assert.strictEqual(items.get('vpc')?.kind, vscode.CompletionItemKind.Folder);
		// One holding none completes with a slash, to go on from.
		assert.ok(items.has('shared/'), `expected shared/ among ${[...items.keys()].join(', ')}`);
		assert.ok(items.has('../'));
		// Nothing but directories is offered inside the path: no blocks, no functions, no hidden directories.
		assert.deepStrictEqual(list.items.filter(item => item.kind !== vscode.CompletionItemKind.Folder).map(item => item.label), []);
		assert.ok(![...items.keys()].some(label => label.startsWith('.vscode')));
		// A unit sorts ahead of a directory that is not one.
		assert.ok((items.get('vpc')?.sortText ?? '') < (items.get('shared/')?.sortText ?? ''));
	});
});
