import * as path from 'path';
import { workspace, ExtensionContext } from 'vscode';

import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
    const serverModule = context.asAbsolutePath(
        path.join('server', 'out', 'server.js')
    );

    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: { execArgv: ['--nolazy', '--inspect=6009'] }
        }
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'hcl' },
            { scheme: 'file', language: 'terragrunt' }
        ],
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher('**/*.{hcl,tfvars}')
        }
    };

    client = new LanguageClient(
        'terragruntHclLanguageServer',
        'Terragrunt HCL Language Server',
        serverOptions,
        clientOptions
    );

    client.start().then(() => {
		console.log('Server capabilities:', client.initializeResult?.capabilities);
	});
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}