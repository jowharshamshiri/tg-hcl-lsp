import * as assert from 'assert';
import * as vscode from 'vscode';
import { ensureActive, openFixture, waitFor } from './helpers';

function render(hovers: vscode.Hover[]): string {
	return hovers.flatMap(hover => hover.contents.map(content => typeof content === 'string' ? content : content.value)).join('\n');
}

async function hoverAt(document: vscode.TextDocument, word: string): Promise<string> {
	const offset = document.getText().indexOf(word);
	assert.ok(offset >= 0, `fixture is missing ${word}`);
	const position = document.positionAt(offset + 1);
	const hovers = await waitFor(
		() => vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', document.uri, position),
		answer => answer.length > 0
	);
	return render(hovers);
}

suite('Hover', () => {
	suiteSetup(ensureActive);

	test('a block shows its documentation', async () => {
		const document = await openFixture('app/terragrunt.hcl');
		assert.match(await hoverAt(document, 'dependency'), /## dependency Block/);
	});

	test('an attribute shows its documentation', async () => {
		const document = await openFixture('app/terragrunt.hcl');
		assert.match(await hoverAt(document, 'config_path'), /## config_path Attribute/);
	});
});
