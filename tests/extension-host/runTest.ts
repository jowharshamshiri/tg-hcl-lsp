import * as path from 'path';
import { runTests } from '@vscode/test-electron';

// Downloads a VS Code build (cached in .vscode-test), launches it with this extension installed and runs the compiled
// suite inside its extension host. The workspace is the fixtures folder, trusted so the server evaluates units.
async function main(): Promise<void> {
	try {
		const extensionDevelopmentPath = path.resolve(__dirname, '..');
		const extensionTestsPath = path.resolve(__dirname, 'suite', 'index.js');
		const workspace = path.resolve(extensionDevelopmentPath, 'tests', 'fixtures');

		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [workspace, '--disable-extensions', '--disable-workspace-trust']
		});
	} catch (error) {
		console.error('Extension host test run failed:', error);
		process.exit(1);
	}
}

void main();
