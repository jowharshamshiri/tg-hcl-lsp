import * as assert from 'assert';
import * as vscode from 'vscode';
import { ensureActive, openFixture, waitFor } from './helpers';

// The keys a for expression's variable has, offered right after `<variable>.` where the fixture writes it. The server
// learns them by evaluating the unit, so they come once it has.
async function keysAfter(document: vscode.TextDocument, written: string, expected: string[]): Promise<string[]> {
	const offset = document.getText().indexOf(written);
	assert.ok(offset >= 0, `fixture is missing ${written}`);
	const position = document.positionAt(offset + written.indexOf('.') + 1);
	const list = await waitFor(
		() => vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', document.uri, position),
		answer => expected.every(key => answer.items.some(item => (typeof item.label === 'string' ? item.label : item.label.label) === key))
	);
	return list.items.map(item => typeof item.label === 'string' ? item.label : item.label.label);
}

suite('For variable completion', () => {
	suiteSetup(ensureActive);

	test('a nested for expression\'s variable, whose collection reads the outer variable, offers its keys', async () => {
		const document = await openFixture('for-variables/terragrunt.hcl');
		assert.deepStrictEqual(await keysAfter(document, 'v.cidr', ['cidr', 'zone']), ['cidr', 'zone']);
	});

	test('the variable of a for expression over a literal list or object offers the keys of its elements', async () => {
		const document = await openFixture('for-variables/terragrunt.hcl');
		assert.deepStrictEqual(await keysAfter(document, 's.name', ['name', 'tier', 'disk']), ['name', 'tier', 'disk']);
		assert.deepStrictEqual(await keysAfter(document, 'r.code', ['code', 'primary']), ['code', 'primary']);
	});
});
