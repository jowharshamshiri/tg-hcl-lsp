import * as assert from 'assert';
import * as vscode from 'vscode';
import { ensureActive, fixtureUri, openFixture, waitFor } from './helpers';

async function definitionOf(document: vscode.TextDocument, reference: string): Promise<vscode.LocationLink> {
	const offset = document.getText().indexOf(reference);
	assert.ok(offset >= 0, `fixture is missing ${reference}`);
	// The cursor is on the last part of the reference, where Ctrl+click usually lands.
	const position = document.positionAt(offset + reference.length - 1);
	const definitions = await waitFor(
		() => vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>('vscode.executeDefinitionProvider', document.uri, position),
		answer => answer.length > 0
	);
	assert.strictEqual(definitions.length, 1, `expected one definition of ${reference}, got ${JSON.stringify(definitions)}`);
	const definition = definitions[0];
	assert.ok('targetUri' in definition, `expected a location link for ${reference}`);
	return definition;
}

function targetText(definition: vscode.LocationLink): Thenable<string> {
	return vscode.workspace.openTextDocument(definition.targetUri)
		.then(target => target.getText(definition.targetSelectionRange ?? definition.targetRange));
}

suite('Definition', () => {
	suiteSetup(ensureActive);

	test('a local leads to where the locals block sets it', async () => {
		const document = await openFixture('definitions/unit/terragrunt.hcl');
		const definition = await definitionOf(document, 'local.name');
		assert.strictEqual(definition.targetUri.fsPath, document.uri.fsPath);
		assert.strictEqual(await targetText(definition), 'name');
	});

	test('a local inside an interpolation leads to where the locals block sets it', async () => {
		const document = await openFixture('definitions/unit/terragrunt.hcl');
		const definition = await definitionOf(document, 'local.prefix');
		assert.strictEqual(definition.targetUri.fsPath, document.uri.fsPath);
		assert.strictEqual(await targetText(definition), 'prefix');
	});

	test('a local of an include leads to the included configuration', async () => {
		const document = await openFixture('definitions/unit/terragrunt.hcl');
		const definition = await definitionOf(document, 'include.root.locals.bucket');
		assert.strictEqual(definition.targetUri.fsPath, fixtureUri('definitions/root.hcl').fsPath);
		assert.strictEqual(await targetText(definition), 'bucket');
	});

	test('an input of an include leads to the included configuration', async () => {
		const document = await openFixture('definitions/unit/terragrunt.hcl');
		const definition = await definitionOf(document, 'include.root.inputs.region');
		assert.strictEqual(definition.targetUri.fsPath, fixtureUri('definitions/root.hcl').fsPath);
		assert.strictEqual(await targetText(definition), 'region');
	});

	test('a dependency declared by an include leads to its block', async () => {
		const document = await openFixture('definitions/unit/terragrunt.hcl');
		const definition = await definitionOf(document, 'dependency.network.outputs.id');
		assert.strictEqual(definition.targetUri.fsPath, fixtureUri('definitions/root.hcl').fsPath);
		assert.match(await targetText(definition), /network/);
	});
});
