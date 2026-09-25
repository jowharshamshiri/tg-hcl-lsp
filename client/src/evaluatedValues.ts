import {
	workspace as Workspace, window as Window, ExtensionContext, Range, TextEditor, TextEditorDecorationType
} from 'vscode';

const SETTING = 'terragrunt.evaluatedValues.underline';
const MODES = ['cursorLine', 'always', 'off'] as const;
type UnderlineMode = typeof MODES[number];

/** A range as the server sends it: zero-based lines and characters. */
export interface WireRange {
	start: { line: number; character: number };
	end: { line: number; character: number };
}

interface PublishedRanges {
	version: number;
	ranges: Range[];
}

function isUnderlineMode(value: unknown): value is UnderlineMode {
	return (MODES as readonly unknown[]).includes(value);
}

/**
 * Underlines the expressions whose evaluated value a hover shows.
 *
 * Which expressions those are is the server's decision: the ones whose value is not already written in the source.
 * Which of them are drawn is the user's, through terragrunt.evaluatedValues.underline -- those on a line with a
 * cursor, all of them, or none. The server's ranges are kept per document, so a change of setting, cursor or
 * visible editor redraws without evaluating anything again.
 */
export class EvaluatedValueUnderlines {
	private readonly decoration: TextEditorDecorationType;
	private readonly published = new Map<string, PublishedRanges>();
	private mode: UnderlineMode = 'cursorLine';
	private rejectedMode: unknown;

	constructor(context: ExtensionContext) {
		this.decoration = Window.createTextEditorDecorationType({ textDecoration: 'underline dotted #8b5cf6' });
		this.readMode();
		context.subscriptions.push(
			this.decoration,
			Workspace.onDidChangeConfiguration(event => {
				if (!event.affectsConfiguration(SETTING)) return;
				this.readMode();
				this.drawAll();
			}),
			// A decoration belongs to an editor, and switching tabs makes a new one without it.
			Window.onDidChangeVisibleTextEditors(() => this.drawAll()),
			Window.onDidChangeTextEditorSelection(event => {
				if (this.mode === 'cursorLine') this.draw(event.textEditor);
			}),
			Workspace.onDidCloseTextDocument(document => {
				this.published.delete(document.uri.toString());
			})
		);
	}

	/** Takes the ranges the server computed for `version` of the document at `uri`, and draws them. */
	publish(uri: string, version: number, ranges: WireRange[]): void {
		this.published.set(uri, {
			version,
			ranges: ranges.map(range => new Range(range.start.line, range.start.character, range.end.line, range.end.character))
		});
		for (const editor of Window.visibleTextEditors) {
			if (editor.document.uri.toString() === uri) this.draw(editor);
		}
	}

	private drawAll(): void {
		for (const editor of Window.visibleTextEditors) this.draw(editor);
	}

	private draw(editor: TextEditor): void {
		if (this.mode === 'off') {
			editor.setDecorations(this.decoration, []);
			return;
		}
		const published = this.published.get(editor.document.uri.toString());
		if (!published) return;
		// Ranges computed for text an edit has since replaced would be drawn in the wrong place. The decorations
		// already drawn move with the edit, and the server publishes ranges for the new text once it has evaluated it.
		if (published.version !== editor.document.version) return;
		editor.setDecorations(this.decoration, this.mode === 'always' ? published.ranges : this.onCursorLines(editor, published.ranges));
	}

	private onCursorLines(editor: TextEditor, ranges: Range[]): Range[] {
		const lines = editor.selections.map(selection => selection.active.line);
		return ranges.filter(range => lines.some(line => range.start.line <= line && line <= range.end.line));
	}

	// An invalid value is rejected rather than coerced: the mode in force is kept, and the user is told which
	// value was ignored, once.
	private readMode(): void {
		const value = Workspace.getConfiguration().get<unknown>(SETTING);
		if (isUnderlineMode(value)) {
			this.mode = value;
			this.rejectedMode = undefined;
			return;
		}
		if (value === this.rejectedMode) return;
		this.rejectedMode = value;
		void Window.showErrorMessage(
			`Ignoring ${SETTING} ${JSON.stringify(value)}: expected one of ${MODES.join(', ')}. Keeping '${this.mode}'.`
		);
	}
}
