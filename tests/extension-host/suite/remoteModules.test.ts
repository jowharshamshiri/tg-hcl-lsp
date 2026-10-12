import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ensureActive, openFixture, waitFor, waitForDiagnostics } from './helpers';
import { TestRegistry } from './registry';

const VPC_VARIABLES = 'variable "name" {\n  description = "VPC name"\n  type = string\n}\n\nvariable "cidr" {\n  type = string\n  default = "10.0.0.0/16"\n}\n';

function settings(): vscode.WorkspaceConfiguration {
	return vscode.workspace.getConfiguration('terragrunt.remoteModules');
}

// Written as user settings of the test run's own profile, and put back afterwards.
async function setting(name: 'enabled' | 'defaultRegistryHost', value: unknown): Promise<void> {
	await settings().update(name, value, vscode.ConfigurationTarget.Global);
}

function problems(uri: vscode.Uri, done: (diagnostics: vscode.Diagnostic[]) => boolean): Promise<vscode.Diagnostic[]> {
	return waitFor(() => Promise.resolve(vscode.languages.getDiagnostics(uri)), done);
}

const fetchingIsOff = (diagnostics: vscode.Diagnostic[]) => diagnostics.some(diagnostic => diagnostic.message.includes('terragrunt.remoteModules.enabled'));

suite('Remote module sources', () => {
	let registry: TestRegistry;
	let units: string;

	// Writes a unit using `source` outside the workspace folder, so the rootless server serves it, and opens it.
	async function openUnit(name: string, source: string, inputs: string): Promise<vscode.TextDocument> {
		const file = path.join(units, name, 'terragrunt.hcl');
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, `terraform {\n  source = "${source}"\n}\n\ninputs = {\n${inputs}\n}\n`);
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
		await vscode.window.showTextDocument(document);
		return document;
	}

	async function completionsAt(document: vscode.TextDocument, line: number): Promise<string[]> {
		const list = await waitFor(
			() => vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', document.uri, new vscode.Position(line, 2)),
			answer => answer.items.some(item => item.label === 'name')
		);
		return list.items.map(item => typeof item.label === 'string' ? item.label : item.label.label);
	}

	suiteSetup(async () => {
		await ensureActive();
		registry = await TestRegistry.start({
			'acme/vpc/aws': { files: { 'variables.tf': VPC_VARIABLES, 'main.tf': 'resource "null_resource" "vpc" {}\n' } },
			'acme/secure/aws': { token: 'test-token', files: { 'variables.tf': VPC_VARIABLES } },
			'acme/private/aws': { token: 'another-token', files: { 'variables.tf': VPC_VARIABLES } }
		});
		units = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-hcl-lsp-units-'));
		// The fixtures' tfr:/// source would otherwise be fetched from the public registry, after asking a question
		// nobody answers. Set before fetching is switched on, so no server is ever asked.
		await setting('defaultRegistryHost', registry.host);
	});

	suiteTeardown(async () => {
		await setting('enabled', undefined);
		await setting('defaultRegistryHost', undefined);
		await registry.stop();
		fs.rmSync(units, { recursive: true, force: true });
	});

	teardown(() => setting('enabled', undefined));

	test('the commands are registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		for (const command of ['clearRemoteModuleCache', 'retryRemoteModules', 'setRegistryToken', 'removeRegistryToken']) {
			assert.ok(commands.includes(`terragrunt.${command}`), `terragrunt.${command} is not registered`);
		}
	});

	test('fetching is off unless switched on', () => {
		assert.strictEqual(settings().inspect<boolean>('enabled')?.defaultValue, false);
		assert.strictEqual(settings().inspect<string>('defaultRegistryHost')?.defaultValue, '');
	});

	test('switching fetching on and off reaches the servers', async () => {
		const document = await openUnit('toggled', registry.source('acme/vpc/aws'), '');
		await problems(document.uri, fetchingIsOff);

		await setting('enabled', true);
		await problems(document.uri, diagnostics => !fetchingIsOff(diagnostics));

		await setting('enabled', undefined);
		assert.ok(fetchingIsOff(await problems(document.uri, fetchingIsOff)), 'the hint did not come back');
	});

	test('tfr:/// means the registry named by the default host setting', async () => {
		const requested = '/v1/modules/terraform-aws-modules/vpc/aws/versions';
		await openFixture('remote/terragrunt.hcl');
		await setting('enabled', true);
		await waitFor(() => Promise.resolve(registry.count(requested)), count => count > 0);
		assert.ok(registry.count(requested) > 0, `the registry was not asked for ${requested}`);
	});

	suite('with fetching on', () => {
		setup(() => setting('enabled', true));

		test('the module\'s variables are completed inside inputs', async () => {
			const document = await openUnit('completed', registry.source('acme/vpc/aws'), '  ');
			const labels = await completionsAt(document, 5);
			assert.ok(labels.includes('name') && labels.includes('cidr'), `expected the module's variables, got ${labels.join(', ')}`);
		});

		test('an input the module does not declare is a warning, and a declared one has its documentation', async () => {
			const document = await openUnit('checked', registry.source('acme/vpc/aws'), '  name = "main"\n  unknown = 1');
			const diagnostics = await problems(document.uri, found => found.some(diagnostic => diagnostic.message.startsWith('Input "unknown" is not declared')));
			assert.strictEqual(diagnostics.find(diagnostic => diagnostic.message.startsWith('Input "unknown"'))?.severity, vscode.DiagnosticSeverity.Warning);

			const position = document.positionAt(document.getText().indexOf('name =') + 1);
			const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', document.uri, position);
			const text = hovers.flatMap(hover => hover.contents.map(content => typeof content === 'string' ? content : content.value)).join('\n');
			assert.match(text, /VPC name/);
		});

		test('a TF_TOKEN_ variable is sent to the registry', async () => {
			const document = await openUnit('secure', registry.source('acme/secure/aws'), '  ');
			await completionsAt(document, 5);
			assert.ok(
				registry.requests.some(request => request.path.startsWith('/v1/modules/acme/secure/aws/') && request.authorization === 'Bearer test-token'),
				'the token was not sent'
			);
		});

		test('a registry refusing the token offers a quick fix to set one, and retrying asks it again', async () => {
			const document = await openUnit('private', registry.source('acme/private/aws'), '');
			const [refused] = (await problems(document.uri, found => found.some(diagnostic => diagnostic.code === 'RegistryAuth')))
				.filter(diagnostic => diagnostic.code === 'RegistryAuth');

			const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>('vscode.executeCodeActionProvider', document.uri, refused.range);
			const fix = actions.find(action => action.title === `Set a registry token for ${registry.host}`);
			assert.ok(fix, `expected a quick fix to set a token, got ${actions.map(action => action.title).join(', ')}`);
			assert.strictEqual(fix.command?.command, 'terragrunt.setRegistryToken');
			assert.deepStrictEqual(fix.command?.arguments, [registry.host]);

			const asked = registry.count('/v1/modules/acme/private/aws/versions');
			await vscode.commands.executeCommand('terragrunt.retryRemoteModules');
			await waitFor(() => Promise.resolve(registry.count('/v1/modules/acme/private/aws/versions')), count => count > asked);
			assert.ok(registry.count('/v1/modules/acme/private/aws/versions') > asked, 'retrying did not ask the registry again');
		});

		// Skipped until tghclparser fetches again a module another workspace has cleared from the cache they share; see
		// its issue "A module cleared from the cache by another Workspace can't be read". Here the folder's server
		// clears after the rootless one has fetched this unit's module again.
		test.skip('clearing the cache leaves the open units\' modules in use', async () => {
			const document = await openUnit('cleared', registry.source('acme/vpc/aws'), '  ');
			await completionsAt(document, 5);
			const downloaded = registry.count('/archives/acme/vpc/aws.tgz');

			await vscode.commands.executeCommand('terragrunt.clearRemoteModuleCache');
			assert.ok(registry.count('/archives/acme/vpc/aws.tgz') > downloaded, 'the module was not downloaded again');

			// Checked again, the unit still reads the module.
			const editor = await vscode.window.showTextDocument(document);
			const published = waitForDiagnostics(document.uri);
			await editor.edit(edit => edit.insert(new vscode.Position(5, 2), ' '));
			assert.deepStrictEqual((await published).map(diagnostic => diagnostic.message), ['Missing required module inputs: name']);
			const labels = await completionsAt(document, 5);
			assert.ok(labels.includes('name'), `expected the module's variables, got ${labels.join(', ')}`);
		});
	});
});
