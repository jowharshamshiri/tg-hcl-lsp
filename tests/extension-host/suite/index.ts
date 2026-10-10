import * as fs from 'fs';
import { SourceMap } from 'module';
import * as path from 'path';
import Mocha from 'mocha';

// The extension host formats stacks itself, ignoring source maps, so a failure's stack names the compiled files in
// out-test. Those frames are rewritten to the TypeScript lines they were built from, which reporters then show.
function mapStack(stack: string): string {
	return stack.replace(/out-test[\\/]suite[\\/]([^\\/:)]+)\.js:(\d+):(\d+)/g, (frame, name: string, line: string, column: string) => {
		const sourceMap = new SourceMap(JSON.parse(fs.readFileSync(path.join(__dirname, `${name}.js.map`), 'utf8')));
		const entry = sourceMap.findEntry(Number(line) - 1, Number(column) - 1);
		if (!('originalLine' in entry)) return frame;
		return `tests/extension-host/suite/${name}.ts:${entry.originalLine + 1}:${entry.originalColumn + 1}`;
	});
}

export async function run(): Promise<void> {
	// On GitHub Actions, failures are also reported as annotations on the lines in their stacks.
	const reporter = process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'spec';
	const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 20_000, reporter });

	for (const file of fs.readdirSync(__dirname).filter(name => name.endsWith('.test.js')).sort()) {
		mocha.addFile(path.resolve(__dirname, file));
	}

	return new Promise((resolve, reject) => {
		const runner = mocha.run(failures => {
			if (failures > 0) reject(new Error(`${failures} test(s) failed.`));
			else resolve();
		});
		// Reporters read a failure's stack when they print it, after the test run ends.
		runner.on('fail', (_test, error: Error) => {
			if (error.stack) error.stack = mapStack(error.stack);
		});
	});
}
