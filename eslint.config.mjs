import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

import { plugins, sourceRules, toolingRules } from './eslint.config.base.mjs';
import svelteConfig from './svelte.config.js';

export default ts.config(
	{
		ignores: ['.svelte-kit/', '.wrangler/', 'build/', 'node_modules/']
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	},
	// The house rules, over what this ships. max-len is inert here: prettier
	// wraps at 100 in this repository, inside the 120 the rule allows.
	{
		files: ['src/**/*.ts', 'src/**/*.js', 'src/**/*.svelte'],
		plugins,
		rules: sourceRules
	},
	// Config and migration scripts: they produce what ships rather than being it.
	{
		files: ['*.ts', '*.js', '*.config.js', 'migrations/**'],
		plugins,
		rules: toolingRules
	}
);
