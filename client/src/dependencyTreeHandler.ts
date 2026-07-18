import * as fs from 'fs';
import * as crypto from 'crypto';
import {
    workspace as Workspace, 
    window as Window, 
    Uri,
    WebviewPanel, 
    ViewColumn, 
    Webview, 
    Disposable, 
    window
} from 'vscode';
export interface DependencyGraphNode {
	name: string;
	type: string;
	uri?: string;
	openable: boolean;
	children: DependencyGraphNode[];
}

export class DependencyTreeViewProvider {
    public static currentPanel: DependencyTreeViewProvider | undefined;
    private readonly _panel: WebviewPanel;
    private readonly _extensionUri: Uri;
    private _disposables: Disposable[] = [];

    private constructor(panel: WebviewPanel, extensionUri: Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._update();
        this._setupMessageListener();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public static createOrShow(extensionUri: Uri) {
        const column = window.activeTextEditor
            ? window.activeTextEditor.viewColumn
            : undefined;

        if (DependencyTreeViewProvider.currentPanel) {
            DependencyTreeViewProvider.currentPanel._panel.reveal(column);
            return;
        }

        const panel = window.createWebviewPanel(
            'terragruntDependencyTree',
            'Terragrunt Dependency Tree',
            column || ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    Uri.joinPath(extensionUri, 'media')
                ]
            }
        );

        DependencyTreeViewProvider.currentPanel = new DependencyTreeViewProvider(panel, extensionUri);
    }

    private _setupMessageListener() {
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.type) {
                    case 'openFile': {
						const uri = Uri.parse(message.uri);
						const folder = Workspace.getWorkspaceFolder(uri);
						if (uri.scheme === 'file' && folder) {
							try {
                                const doc = await Workspace.openTextDocument(uri);
                                await Window.showTextDocument(doc, {
                                    preview: false,
                                    preserveFocus: true
                                });
                            } catch (error) {
                                Window.showErrorMessage(`Error opening file: ${error}`);
                            }
						} else Window.showErrorMessage('The selected configuration is outside the current workspace.');
						break;
					}
                }
            },
            undefined,
            this._disposables
        );
    }

    public updateTreeData(rootNode: DependencyGraphNode | undefined) {
        if (this._panel) {
            this._panel.webview.postMessage({ type: 'treeData', data: rootNode });
        }
    }

	public showError(message: string) {
		this._panel.webview.postMessage({ type: 'treeError', message });
	}

    private _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: Webview) {
        // Get the local path to script file
        const scriptPathOnDisk = Uri.joinPath(this._extensionUri, 'media', 'script.js');
        const scriptUri = webview.asWebviewUri(scriptPathOnDisk);
		const nonce = crypto.randomBytes(16).toString('base64');

        // Get path to HTML file
        const htmlPathOnDisk = Uri.joinPath(this._extensionUri, 'media', 'd3-tree.html');
        let htmlContent = fs.readFileSync(htmlPathOnDisk.fsPath, 'utf8');

        // Replace {{scriptUri}} with the actual URI of the script
        htmlContent = htmlContent.replace('{{scriptUri}}', scriptUri.toString());
		htmlContent = htmlContent.split('{{nonce}}').join(nonce);

        return htmlContent;
    }

    private dispose() {
        DependencyTreeViewProvider.currentPanel = undefined;
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
