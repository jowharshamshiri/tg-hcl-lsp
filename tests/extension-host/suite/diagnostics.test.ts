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

	test('every syntax error in a file is shown, not only the first, as Terragrunt 1.2.2 reports them', async () => {
		const published = waitForDiagnostics(fixtureUri('several-errors/terragrunt.hcl'));
		await openFixture('several-errors/terragrunt.hcl');

		// The parser carries on after the missing operand in locals, past the valid terraform block, to the two halves
		// of the surrogate pair in inputs, each refused at its own escape.
		const errors = (await published)
			.filter(diagnostic => diagnostic.severity === vscode.DiagnosticSeverity.Error)
			.map(diagnostic => [diagnostic.source, diagnostic.message, diagnostic.range.start.line, diagnostic.range.start.character, diagnostic.range.end.line, diagnostic.range.end.character]);
		assert.deepStrictEqual(errors, [
			['terragrunt', 'Invalid expression: Expected the start of an expression, but found an invalid expression token.', 1, 17, 2, 0],
			['terragrunt', 'Invalid escape sequence: Cannot encode character U+d83d in UTF-8.', 9, 11, 9, 17],
			['terragrunt', 'Invalid escape sequence: Cannot encode character U+de00 in UTF-8.', 9, 17, 9, 23]
		]);
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
