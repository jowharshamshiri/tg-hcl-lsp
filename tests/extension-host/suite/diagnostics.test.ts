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
});
