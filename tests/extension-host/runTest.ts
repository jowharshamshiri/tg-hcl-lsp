import * as fs from 'fs';
import { createServer } from 'net';
import * as os from 'os';
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

// A port free now, for the suite's registry to listen on once VS Code is up.
function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer().once('error', reject).listen(0, '127.0.0.1', () => {
			const address = server.address();
			server.close(() => address && typeof address !== 'string' ? resolve(address.port) : reject(new Error('no port was assigned')));
		});
	});
}

// Downloads a VS Code build (cached in .vscode-test), launches it with this extension installed and runs the compiled
// suite inside its extension host. The workspace is the fixtures folder, trusted so the server evaluates units.
async function main(): Promise<void> {
	// Fetched modules go to a cache of this run's own, which goes with it.
	const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-hcl-lsp-test-cache-'));
	try {
		const extensionDevelopmentPath = path.resolve(__dirname, '..');
		const extensionTestsPath = path.resolve(__dirname, 'suite', 'index.js');
		const workspace = path.resolve(extensionDevelopmentPath, 'tests', 'fixtures');
		const registryPort = await freePort();

		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [workspace, '--disable-extensions', '--disable-workspace-trust'],
			// The suite serves modules from a registry on the loopback address, over plain HTTP; the language server
			// contacts it without asking and sends it the token Terraform would read for it.
			extensionTestsEnv: {
				TGHCLP_INSECURE_REGISTRY_HOSTS: '127.0.0.1',
				TGHCLPARSER_CACHE_DIR: cacheDir,
				TF_TOKEN_127_0_0_1: 'test-token',
				TG_TF_DEFAULT_REGISTRY_HOST: `127.0.0.1:${registryPort}`,
				TG_HCL_LSP_TEST_REGISTRY_PORT: String(registryPort)
			}
		});
	} catch (error) {
		console.error('Extension host test run failed:', error);
		process.exitCode = 1;
	} finally {
		fs.rmSync(cacheDir, { recursive: true, force: true });
	}
}

void main();
