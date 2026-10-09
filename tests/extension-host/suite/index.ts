import * as fs from 'fs';
import * as path from 'path';
import Mocha from 'mocha';

export async function run(): Promise<void> {
	const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 20_000 });

	for (const file of fs.readdirSync(__dirname).filter(name => name.endsWith('.test.js')).sort()) {
		mocha.addFile(path.resolve(__dirname, file));
	}

	return new Promise((resolve, reject) => {
		mocha.run(failures => {
			if (failures > 0) reject(new Error(`${failures} test(s) failed.`));
			else resolve();
		});
	});
}
