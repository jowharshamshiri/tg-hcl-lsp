import * as assert from 'assert';
import * as vscode from 'vscode';
import { ensureActive, fixtureUri, openFixture, waitForDiagnostics } from './helpers';

suite('Diagnostics', () => {
	suiteSetup(ensureActive);

	test('a syntax error is reported', async () => {
		const published = waitForDiagnostics(fixtureUri('invalid/terragrunt.hcl'));
		await openFixture('invalid/terragrunt.hcl');

		const diagnostics = await published;
		assert.ok(
			diagnostics.some(diagnostic => diagnostic.severity === vscode.DiagnosticSeverity.Error && diagnostic.source === 'terragrunt'),
			`expected a terragrunt error, got ${JSON.stringify(diagnostics)}`
		);
	});

	test('a valid unit has no problems', async () => {
		const published = waitForDiagnostics(fixtureUri('clean/terragrunt.hcl'));
		await openFixture('clean/terragrunt.hcl');

		assert.deepStrictEqual(await published, []);
	});

	test('every evaluation fault is underlined where it is written', async () => {
		const published = waitForDiagnostics(fixtureUri('missing-local/terragrunt.hcl'));
		await openFixture('missing-local/terragrunt.hcl');

		const faults = (await published)
			.filter(diagnostic => diagnostic.source === 'terragrunt-evaluation')
			.map(diagnostic => [diagnostic.message, diagnostic.range.start.line, diagnostic.range.start.character, diagnostic.range.end.character]);
		assert.deepStrictEqual(faults, [
			['Configuration evaluation: Undefined local value "missing"', 5, 11, 24],
			['Configuration evaluation: Missing attribute "zone" on "config"', 6, 11, 28]
		]);
	});

	test('a workspace error is reported alongside the file\'s other problems', async () => {
		const published = waitForDiagnostics(fixtureUri('shared-root/root.hcl'));
		await openFixture('shared-root/root.hcl');

		const messages = (await published).map(diagnostic => [diagnostic.source, diagnostic.message]);
		assert.ok(
			messages.some(([source, message]) => source === 'terragrunt-workspace' && message === 'Could not find stage.hcl in parent folders'),
			`expected the workspace error, got ${JSON.stringify(messages)}`
		);
		assert.ok(
			messages.some(([, message]) => message === 'Unknown attribute "bad_property" in remote_state block'),
			`expected the unknown attribute, got ${JSON.stringify(messages)}`
		);
	});
});
