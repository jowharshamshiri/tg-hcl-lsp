import * as assert from 'assert';
import * as vscode from 'vscode';
import { ensureActive, openFixture, waitFor } from './helpers';

// Blocks no fixture spells out, so they can only come from the server.
const BLOCKS = ['include', 'remote_state', 'generate'];

async function labelsAt(document: vscode.TextDocument, position: vscode.Position): Promise<string[]> {
	const list = await waitFor(
		() => vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', document.uri, position),
		answer => answer.items.some(item => item.label === BLOCKS[0])
	);
	return list.items.map(item => typeof item.label === 'string' ? item.label : item.label.label);
}

function assertOffersBlocks(labels: string[]): void {
	for (const block of BLOCKS) {
		assert.ok(labels.includes(block), `expected ${block} among ${labels.join(', ')}`);
	}
}

suite('Completion', () => {
	suiteSetup(ensureActive);

	test('a blank line in a unit offers the top-level blocks', async () => {
		const document = await openFixture('app/terragrunt.hcl');
		const blank = document.getText().split('\n').indexOf('');
		assert.ok(blank >= 0, 'fixture has no blank line');

		assertOffersBlocks(await labelsAt(document, new vscode.Position(blank, 0)));
	});

	test('an empty untitled configuration offers the top-level blocks', async () => {
		const document = await vscode.workspace.openTextDocument({ language: 'terragrunt', content: '' });
		await vscode.window.showTextDocument(document);

		assertOffersBlocks(await labelsAt(document, new vscode.Position(0, 0)));
	});
});
