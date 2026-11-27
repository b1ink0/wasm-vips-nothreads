/**
 * External dependencies
 */
import globals from 'globals';
import wpScriptsConfig from '@wordpress/scripts/config/eslint.config.cjs';

export default [
	...wpScriptsConfig,
	{
		ignores: [
			'build/',
			'src/',
			'upstream/',
			'vendor/',
			'work/',
			'site/iso/coi-serviceworker.js',
			'**/*.min.js',
		],
	},
	{
		files: [ 'site/**/*.js' ],
		languageOptions: {
			globals: globals.browser,
		},
	},
	{
		// Node scripts and config files.
		files: [ 'scripts/**/*.ts', '*.config.js' ],
		languageOptions: {
			globals: globals.node,
		},
		rules: {
			'no-console': 'off',
		},
	},
	{
		// Node scripts that also run code in the browser and read wasm binaries.
		files: [ 'research/**/*.mjs' ],
		languageOptions: {
			globals: { ...globals.node, ...globals.browser },
		},
		rules: {
			'no-console': 'off',
			'no-bitwise': 'off',
		},
	},
];
