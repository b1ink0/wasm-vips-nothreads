/**
 * Every benchmark run behind the README tables. Needs npm run setup and npm run build first.
 *
 * Usage: node scripts/bench.ts [node|browser]. With no step, runs both.
 * Output: results/node-*.json and results/browser-*.json.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join( import.meta.dirname, '..' );
const NPM = 'src/npm-0.0.19/lib';
const BASE = 'src/baseline/lib';
const NT = 'src/nothreads/lib';
const LARGE = 'input-8660x5773.jpg';
const step = process.argv[ 2 ];

function node( lib: string, label: string, ...args: string[] ) {
	execFileSync(
		'node',
		[ 'scripts/bench-node.ts', '--lib', lib, '--label', label, ...args ],
		{ cwd: ROOT, stdio: 'inherit' }
	);
}

function browser( ...args: string[] ) {
	execFileSync( 'node', [ 'scripts/bench-browser.ts', ...args ], {
		cwd: ROOT,
		stdio: 'inherit',
	} );
}

if ( step !== 'browser' ) {
	// JPEG and WebP, every WordPress sub-size of the 24 MP input.
	node( NPM, 'npm-default' );
	node( BASE, 'baseline-default' );
	node( BASE, 'baseline-c1', '--concurrency', '1' );
	node( BASE, 'baseline-c1-j4', '--concurrency', '1', '--jobs', '4' );
	for ( const jobs of [ '1', '2', '4', '6' ] ) {
		node( NT, `nothreads-j${ jobs }`, '--jobs', jobs );
	}

	// The same with AVIF added.
	node( NPM, 'avif-npm-default', '--avif' );
	node( BASE, 'avif-baseline-default', '--avif' );
	node( BASE, 'avif-baseline-c1', '--concurrency', '1', '--avif' );
	node(
		BASE,
		'avif-baseline-c1-j4',
		'--concurrency',
		'1',
		'--jobs',
		'4',
		'--avif'
	);
	for ( const jobs of [ '1', '4' ] ) {
		node( NT, `avif-nothreads-j${ jobs }`, '--jobs', jobs, '--avif' );
	}

	// One 50 MP image: every sub-size, then a single sub-size that cannot be spread over workers.
	node( BASE, '50mp-baseline-default', '--input', LARGE, '--iters', '3' );
	node(
		BASE,
		'50mp-baseline-c1',
		'--concurrency',
		'1',
		'--input',
		LARGE,
		'--iters',
		'3'
	);
	node(
		BASE,
		'50mp-baseline-c1-j4',
		'--concurrency',
		'1',
		'--jobs',
		'4',
		'--input',
		LARGE,
		'--iters',
		'3'
	);
	for ( const jobs of [ '1', '4' ] ) {
		node(
			NT,
			`50mp-nothreads-j${ jobs }`,
			'--jobs',
			jobs,
			'--input',
			LARGE,
			'--iters',
			'3'
		);
	}
	node(
		BASE,
		'50mp-single-baseline-default',
		'--input',
		LARGE,
		'--only',
		'2048x2048.jpeg'
	);
	node(
		NT,
		'50mp-single-nothreads',
		'--input',
		LARGE,
		'--only',
		'2048x2048.jpeg'
	);
}

if ( step !== 'node' ) {
	// Chromium, Firefox and WebKit through Playwright.
	browser();
	browser( '--avif', '--label', 'avif' );
	browser( '--input', LARGE, '--iters', '3', '--label', '50mp' );
}
