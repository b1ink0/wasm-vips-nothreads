/**
 * External dependencies
 */
import wordpressConfig from '@wordpress/prettier-config';

/** @type {import('prettier').Config} */
export default {
	...wordpressConfig,
	overrides: [
		...wordpressConfig.overrides,
		{
			files: '*.{yml,yaml}',
			options: {
				tabWidth: 2,
				useTabs: false,
			},
		},
	],
};
