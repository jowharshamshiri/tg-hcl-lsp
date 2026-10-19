import { spawnSync } from 'child_process';
import * as fs from 'fs';
import { createServer } from 'http';
import type { IncomingMessage, Server, ServerResponse } from 'http';
import * as os from 'os';
import * as path from 'path';

/** A module the registry serves, at version 1.0.0. */
export interface ServedModule {
	/** The token its requests must carry, or undefined for a module anyone may fetch. */
	token?: string;
	/** Its top-level files, by name. */
	files: Record<string, string>;
}

export interface LoggedRequest {
	path: string;
	authorization: string | undefined;
}

/**
 * A module registry on the loopback address, speaking the module registry protocol over plain HTTP: discovery, the
 * versions listing, and a download location pointing at a tar.gz it also serves. The language server reaches it
 * because the test run names 127.0.0.1 in TGHCLP_INSECURE_REGISTRY_HOSTS.
 */
export class TestRegistry {
	readonly requests: LoggedRequest[] = [];

	private constructor(
		private readonly server: Server,
		readonly host: string,
		private readonly modules: Map<string, ServedModule>,
		private readonly archives: Map<string, Buffer>
	) {}

	/** Serves each module at its `namespace/name/provider` address, on `port`, or any free port for 0. */
	static async start(modules: Record<string, ServedModule>, port = 0): Promise<TestRegistry> {
		const archives = new Map<string, Buffer>();
		for (const [address, module] of Object.entries(modules)) archives.set(address, tarGz(module.files));
		// The server answers through whichever registry it is given once its port is known.
		const answering: { registry?: TestRegistry } = {};
		const server = createServer((request, response) => answering.registry!.handle(request, response));
		await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
		const address = server.address();
		if (address === null || typeof address === 'string') throw new Error('the test registry did not expose a TCP port');
		answering.registry = new TestRegistry(server, `127.0.0.1:${address.port}`, new Map(Object.entries(modules)), archives);
		return answering.registry;
	}

	/** A `terraform { source }` naming a module this registry serves. */
	source(address: string): string {
		return `tfr://${this.host}/${address}?version=1.0.0`;
	}

	/** How many requests have been made for paths starting with `prefix`. */
	count(prefix: string): number {
		return this.requests.filter(request => request.path.startsWith(prefix)).length;
	}

	stop(): Promise<void> {
		return new Promise((resolve, reject) => this.server.close(error => error ? reject(error) : resolve()));
	}

	private handle(request: IncomingMessage, response: ServerResponse): void {
		const url = request.url ?? '/';
		this.requests.push({ path: url, authorization: request.headers.authorization });
		if (url === '/.well-known/terraform.json') return json(response, { 'modules.v1': '/v1/modules/' });

		const api = url.match(/^\/v1\/modules\/([^/]+\/[^/]+\/[^/]+)\/(versions|1\.0\.0\/download)$/);
		if (api) {
			const module = this.modules.get(api[1]);
			if (!module) return end(response, 404);
			if (module.token && request.headers.authorization !== `Bearer ${module.token}`) return end(response, 401);
			if (api[2] === 'versions') return json(response, { modules: [{ versions: [{ version: '1.0.0' }] }] });
			response.writeHead(204, { 'x-terraform-get': `/archives/${api[1]}.tgz` });
			return void response.end();
		}

		const archive = url.match(/^\/archives\/(.+)\.tgz$/);
		const data = archive ? this.archives.get(archive[1]) : undefined;
		if (!data) return end(response, 404);
		response.writeHead(200, { 'content-type': 'application/octet-stream' });
		response.end(data);
	}
}

function json(response: ServerResponse, body: unknown): void {
	response.writeHead(200, { 'content-type': 'application/json' });
	response.end(JSON.stringify(body));
}

function end(response: ServerResponse, status: number): void {
	response.writeHead(status);
	response.end();
}

// Built with the system tar, which every platform the suite runs on has.
function tarGz(files: Record<string, string>): Buffer {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-hcl-lsp-module-'));
	try {
		for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), content);
		const archive = path.join(directory, 'module.tgz');
		const result = spawnSync('tar', ['-czf', archive, '-C', directory, ...Object.keys(files)], {
			encoding: 'utf8',
			// macOS's tar would otherwise add resource fork entries.
			env: { ...process.env, COPYFILE_DISABLE: '1' }
		});
		if (result.status !== 0) throw new Error(`tar failed: ${result.stderr}`);
		return fs.readFileSync(archive);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
}
