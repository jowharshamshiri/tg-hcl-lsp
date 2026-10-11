import * as assert from 'assert';
import * as vscode from 'vscode';
import { ensureActive, fixtureUri, openFixture, waitFor } from './helpers';

// The problem the workspace graph reports for a document, once the server has checked it.
async function workspaceProblem(relativePath: string): Promise<vscode.Diagnostic> {
	const document = await openFixture(relativePath);
	const problems = await waitFor(
		async () => vscode.languages.getDiagnostics(document.uri).filter(problem => problem.source === 'terragrunt-workspace'),
		answer => answer.length > 0
	);
	assert.strictEqual(problems.length, 1, `expected one workspace problem, got ${JSON.stringify(problems)}`);
	return problems[0];
}

suite('A dependency path that cannot be resolved', () => {
	suiteSetup(ensureActive);

	test('is underlined where it is written', async () => {
		const problem = await workspaceProblem('unresolved/terragrunt.hcl');

		assert.match(problem.message, /nowhere contains neither terragrunt\.hcl nor terragrunt\.stack\.hcl$/);
		// The quoted path on the fourth line, not the first character of the file.
		assert.deepStrictEqual(
			[problem.range.start.line, problem.range.start.character, problem.range.end.line, problem.range.end.character],
			[3, 16, 3, 28]
		);
	});

	test('written in an included configuration stays on the unit and points at the path', async () => {
		const problem = await workspaceProblem('inherits/terragrunt.hcl');

		assert.deepStrictEqual([problem.range.start.line, problem.range.start.character], [0, 0]);
		const related = problem.relatedInformation ?? [];
		assert.strictEqual(related.length, 1);
		assert.strictEqual(related[0].location.uri.toString(), fixtureUri('shared/common.hcl').toString());
		assert.deepStrictEqual([related[0].location.range.start.line, related[0].location.range.start.character], [1, 16]);
	});
});
