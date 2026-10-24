import { window as Window, Disposable, ExtensionContext } from 'vscode';

const APPROVED_HOSTS = 'terragrunt.remoteModules.approvedHosts';
const DENIED_HOSTS = 'terragrunt.remoteModules.deniedHosts';
const TOKEN_HOSTS = 'terragrunt.registryTokenHosts';
const TOKEN_PREFIX = 'terragrunt.registryToken.';

/**
 * A host as the parser names it: lower-cased ASCII, with the port kept only when it is not 443. An https:// prefix
 * is accepted; anything else beyond a host and port is not.
 */
export function canonicalHost(input: string): string | undefined {
	try {
		const url = new URL(`https://${input.trim().replace(/^https:\/\//i, '')}`);
		if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return undefined;
		return url.host;
	} catch {
		return undefined;
	}
}

/**
 * Answers the servers' questions about contacting a host. Every server asks for itself, so the answers are kept
 * here: servers asking about the same host share one prompt, and an answer holds for the session, or for good when
 * it is Always Allow or Always Deny, until it is forgotten.
 */
export class HostApprovals {
	private answers = new Map<string, Promise<boolean>>();

	constructor(private readonly context: ExtensionContext) {}

	approve(host: string, kind: 'git' | 'registry'): Promise<boolean> {
		if (this.remembered(APPROVED_HOSTS).includes(host)) return Promise.resolve(true);
		if (this.remembered(DENIED_HOSTS).includes(host)) return Promise.resolve(false);
		let answer = this.answers.get(host);
		if (!answer) {
			answer = this.ask(host, kind);
			this.answers.set(host, answer);
		}
		return answer;
	}

	/** Forgets this session's answers, so a host that was denied is asked about again. */
	forgetSession(): void {
		this.answers.clear();
	}

	/**
	 * Forgets what was answered for a host, this session's answer and an Always Allow or Always Deny, so it is asked
	 * about again. Without a host, the hosts with a remembered answer are offered to pick from.
	 *
	 * @returns whether a host was forgotten; false when none was picked.
	 */
	async forget(host?: string): Promise<boolean> {
		const picked = host ?? await this.pickRemembered();
		if (picked === undefined) return false;
		this.answers.delete(picked);
		for (const key of [APPROVED_HOSTS, DENIED_HOSTS]) {
			await this.context.globalState.update(key, this.remembered(key).filter(candidate => candidate !== picked));
		}
		return true;
	}

	private async pickRemembered(): Promise<string | undefined> {
		const items = [
			...this.remembered(APPROVED_HOSTS).map(label => ({ label, description: 'always allowed' })),
			...this.remembered(DENIED_HOSTS).map(label => ({ label, description: 'always denied' }))
		];
		if (items.length === 0) {
			void Window.showInformationMessage('No module host has a remembered answer.');
			return undefined;
		}
		const item = await Window.showQuickPick(items, { title: 'Forget a Module Host\'s Answer', placeHolder: 'The host to be asked about again' });
		return item?.label;
	}

	private remembered(key: string): string[] {
		return this.context.globalState.get<string[]>(key, []);
	}

	private async ask(host: string, kind: 'git' | 'registry'): Promise<boolean> {
		const choice = await Window.showWarningMessage(
			`Allow Terragrunt to fetch modules from the ${kind === 'git' ? 'git host' : 'registry'} ${host}?`,
			'Allow', 'Always Allow', 'Deny', 'Always Deny'
		);
		// A prompt closed without an answer refuses this fetch only; the host is asked about again next time.
		if (choice === undefined) this.answers.delete(host);
		if (choice === 'Always Allow' || choice === 'Always Deny') {
			const key = choice === 'Always Allow' ? APPROVED_HOSTS : DENIED_HOSTS;
			await this.context.globalState.update(key, [...this.remembered(key), host]);
		}
		return choice === 'Allow' || choice === 'Always Allow';
	}
}

/**
 * Registry tokens, kept in the editor's secret storage -- the system keychain -- and handed to a server only when it
 * is about to contact the host a token is for. Which hosts have one is not secret, and is kept so a token can be
 * picked for removal.
 */
export class RegistryTokens {
	constructor(private readonly context: ExtensionContext) {}

	onDidChange(listener: () => void): Disposable {
		return this.context.secrets.onDidChange(event => {
			if (event.key.startsWith(TOKEN_PREFIX)) listener();
		});
	}

	async tokenFor(host: string): Promise<string | undefined> {
		const canonical = canonicalHost(host);
		return canonical ? this.context.secrets.get(TOKEN_PREFIX + canonical) : undefined;
	}

	/** Asks for a token, and first for the host it is for unless one is given. */
	async set(forHost?: string): Promise<void> {
		const host = (forHost && canonicalHost(forHost)) ? forHost : await Window.showInputBox({
			title: 'Set Registry Token',
			prompt: 'The registry host the token is for',
			placeHolder: 'app.terraform.io',
			ignoreFocusOut: true,
			validateInput: value => canonicalHost(value) ? undefined : 'Enter a host name, such as app.terraform.io'
		});
		if (host === undefined) return;
		const canonical = canonicalHost(host)!;
		const token = await Window.showInputBox({
			title: `Set Registry Token for ${canonical}`,
			prompt: 'The API token, kept in the system keychain',
			password: true,
			ignoreFocusOut: true,
			validateInput: value => value.trim() ? undefined : 'Enter the token'
		});
		if (token === undefined) return;
		await this.context.secrets.store(TOKEN_PREFIX + canonical, token.trim());
		await this.context.globalState.update(TOKEN_HOSTS, [...new Set([...this.hosts(), canonical])].sort());
		void Window.showInformationMessage(`The registry token for ${canonical} is saved.`);
	}

	async remove(): Promise<void> {
		const hosts = this.hosts();
		if (hosts.length === 0) {
			void Window.showInformationMessage('No registry tokens are set.');
			return;
		}
		const host = await Window.showQuickPick(hosts, { title: 'Remove Registry Token', placeHolder: 'The host whose token to remove' });
		if (!host) return;
		await this.context.secrets.delete(TOKEN_PREFIX + host);
		await this.context.globalState.update(TOKEN_HOSTS, hosts.filter(candidate => candidate !== host));
		void Window.showInformationMessage(`The registry token for ${host} is removed.`);
	}

	private hosts(): string[] {
		return this.context.globalState.get<string[]>(TOKEN_HOSTS, []);
	}
}
