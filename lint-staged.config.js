/** @type {import('lint-staged').Configuration} */
export default {
	'**/*.{js,ts}': [ 'npm run lint-js', () => 'npm run tsc' ],
	'**/*.php': 'composer lint',
	'composer.{json,lock}': () => 'composer validate --strict',
};
