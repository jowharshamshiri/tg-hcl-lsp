const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const stylistic = require('@stylistic/eslint-plugin');

module.exports = tseslint.config(
	{
		ignores: [
			'**/node_modules/**',
			'**/out/**',
			'dist/**',
			'.vscode-test/**',
			'*.vsix'
		]
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['**/*.ts'],
		plugins: { '@stylistic': stylistic },
		rules: {
			'@stylistic/semi': ['error', 'always'],
			'@typescript-eslint/no-unused-vars': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/explicit-module-boundary-types': 'off',
			'@typescript-eslint/no-non-null-assertion': 'off'
		}
	},
	{
		// Build and config scripts are CommonJS run by Node, not bundled TypeScript.
		files: ['*.js'],
		languageOptions: {
			sourceType: 'commonjs',
			globals: { require: 'readonly', module: 'writable', process: 'readonly', __dirname: 'readonly' }
		},
		rules: {
			'@typescript-eslint/no-require-imports': 'off'
		}
	},
	{
		// Webview scripts run in the browser against the VS Code webview API.
		files: ['media/**/*.js'],
		languageOptions: {
			globals: {
				acquireVsCodeApi: 'readonly',
				document: 'readonly',
				window: 'readonly',
				console: 'readonly'
			}
		}
	}
);
