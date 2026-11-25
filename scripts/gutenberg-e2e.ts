/**
 * Runs the media e2e tests of Gutenberg in Chromium, Firefox and WebKit twice: with the release
 * wasm-vips as Gutenberg ships it, and with the build without threads, the `SharedArrayBuffer`
 * check removed and no cross-origin isolation.
 * Clones Gutenberg at a pinned commit into src/gutenberg-e2e, applies patches/gutenberg-e2e.patch
 * to both runs and patches/gutenberg-nothreads.patch to the second, then starts its test site at
 * http://localhost:8889 with wp-env.
 *
 * Usage: node scripts/gutenberg-e2e.ts. Needs npm run setup and npm run build nothreads first.
 * Output: results/gutenberg-e2e.json
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join( import.meta.dirname, '..' );
const DIR = join( ROOT, 'src/gutenberg-e2e' );
// Gutenberg trunk on 25 November 2026.
const GUTENBERG = {
	repo: 'https://github.com/WordPress/gutenberg.git',
	commit: 'd15f04a87173302fb9107e8e663abdef5de47398',
};
// The release build is the npm package Gutenberg installs, unpacked by npm run setup.
const LIBS = {
	baseline: join( ROOT, 'src/npm-0.0.19/lib' ),
	nothreads: join( ROOT, 'src/nothreads/lib' ),
};
const LIB_FILES = [
	'vips-es6.js',
	'vips.js',
	'vips.wasm',
	'vips-heif.wasm',
	'vips-jxl.wasm',
	'vips-node.js',
	'vips-node.mjs',
];
// Every spec that uploads media, relative to test/e2e.
const SPECS = [
	'specs/editor/various/client-side-media',
	'specs/editor/various/animated-image-subsizes',
	'specs/editor/various/gif-to-video',
	'specs/editor/various/heic-',
	'specs/editor/various/big-image-size-threshold',
	'specs/editor/various/upload-progress-snackbar',
	'specs/editor/various/upload-save-lock',
	'specs/editor/blocks/image.spec',
	'specs/editor/blocks/gallery.spec',
	'specs/editor/blocks/cover.spec',
];

interface PlaywrightSuite {
	file: string;
	specs: {
		title: string;
		tests: {
			projectName: string;
			status: string;
			annotations: { type: string; description?: string }[];
			results: {
				status: string;
				duration: number;
				annotations?: { type: string; description?: string }[];
			}[];
		}[];
	}[];
	suites?: PlaywrightSuite[];
}

function git( ...args: string[] ): string {
	return execFileSync( 'git', [ '-C', DIR, ...args ], {
		encoding: 'utf8',
	} ).trim();
}

function run( command: string, args: string[], cwd = DIR ) {
	execFileSync( command, args, { cwd, stdio: 'inherit' } );
}

/**
 * Applies a patch from patches/, or reverts it, unless it is already in that state.
 * @param name Patch file name.
 * @param on   Whether the patch should be applied.
 */
function patch( name: string, on: boolean ) {
	const file = join( ROOT, 'patches', name );
	let applied = true;
	try {
		git( 'apply', '-R', '--check', file );
	} catch {
		applied = false;
	}
	if ( on !== applied ) {
		git( 'apply', ...( on ? [] : [ '-R' ] ), file );
	}
}

if ( ! existsSync( join( DIR, '.git' ) ) ) {
	mkdirSync( DIR, { recursive: true } );
	git( 'init', '-q' );
	git( 'remote', 'add', 'origin', GUTENBERG.repo );
	git( 'fetch', '-q', '--depth', '1', 'origin', GUTENBERG.commit );
	git( 'checkout', '-q', 'FETCH_HEAD' );
}
if ( git( 'rev-parse', 'HEAD' ) !== GUTENBERG.commit ) {
	throw new Error( `src/gutenberg-e2e is not at ${ GUTENBERG.commit }` );
}
if ( ! existsSync( join( DIR, 'node_modules' ) ) ) {
	run( 'npm', [ 'ci' ] );
}
run( 'npx', [ 'playwright', 'install', 'chromium', 'firefox', 'webkit' ] );

// 10 and 12-bit AVIF test images, made from images/input.jpg with the Node build without threads.
const { default: Vips } = await import(
	pathToFileURL( join( LIBS.nothreads, 'vips-node.mjs' ) ).href
);
const vips = await Vips();
const image = vips.Image.newFromBuffer(
	readFileSync( join( ROOT, 'images/input.jpg' ) )
)
	.thumbnailImage( 1024 )
	.colourspace( 'rgb16' );
for ( const bitdepth of [ 10, 12 ] ) {
	writeFileSync(
		join(
			DIR,
			`test/e2e/assets/1024x683_e2e_test_image_${ bitdepth }bit.avif`
		),
		image.heifsaveBuffer( { compression: 'av1', bitdepth } )
	);
}

const runs: Record< string, unknown[] > = {};
for ( const variant of [ 'baseline', 'nothreads' ] as const ) {
	patch( 'gutenberg-e2e.patch', true );
	patch( 'gutenberg-nothreads.patch', variant === 'nothreads' );
	for ( const file of LIB_FILES ) {
		copyFileSync(
			join( LIBS[ variant ], file ),
			join( DIR, 'packages/vips/node_modules/wasm-vips/lib', file )
		);
	}
	run( 'npm', [ 'run', 'build' ] );
	run( 'npx', [ 'wp-env', '--config', '.wp-env.test.json', 'start' ] );

	const json = join( DIR, `test/e2e/results-${ variant }.json` );
	console.log( `${ variant }: running the media tests` );
	const log = openSync(
		join( ROOT, `results/gutenberg-e2e-${ variant }.log` ),
		'w'
	);
	// Exits non-zero when a test fails, which is part of the result.
	spawnSync(
		'npm',
		[
			'exec',
			'--no',
			'--workspace',
			'@wordpress/e2e-tests-playwright',
			'--',
			'wp-scripts',
			'test-e2e',
			'--config',
			'playwright.media.config.ts',
			'--wp-env-config=../../.wp-env.test.json',
			...SPECS,
		],
		{
			cwd: DIR,
			env: { ...process.env, MEDIA_RESULTS: json },
			stdio: [ 'ignore', log, log ],
		}
	);

	const tests: unknown[] = [];
	const walk = ( suite: PlaywrightSuite ) => {
		for ( const spec of suite.specs ) {
			for ( const test of spec.tests ) {
				const result = test.results.at( -1 );
				const notes = new Set(
					[ ...test.annotations, ...( result?.annotations ?? [] ) ]
						.filter( ( { type } ) => type !== 'skip' )
						.map(
							( { type, description } ) =>
								`${ type }: ${ description }`
						)
				);
				tests.push( {
					browser: test.projectName,
					file: suite.file,
					title: spec.title,
					status:
						test.status === 'skipped' ? 'skipped' : result?.status,
					ms: result?.duration,
					...( notes.size && { notes: [ ...notes ] } ),
				} );
			}
		}
		suite.suites?.forEach( walk );
	};
	(
		JSON.parse( readFileSync( json, 'utf8' ) ).suites as PlaywrightSuite[]
	 ).forEach( walk );
	runs[ variant ] = tests;
	const count = ( status: string ) =>
		tests.filter( ( t ) => ( t as { status: string } ).status === status )
			.length;
	console.log(
		`${ variant }: ${ count( 'passed' ) } passed, ${ count(
			'failed'
		) } failed, ${ count( 'skipped' ) } skipped`
	);
}

writeFileSync(
	join( ROOT, 'results/gutenberg-e2e.json' ),
	JSON.stringify( { gutenberg: GUTENBERG.commit, runs }, null, '\t' ) + '\n'
);
console.log( 'wrote results/gutenberg-e2e.json' );
console.log(
	'Stop the test site: (cd src/gutenberg-e2e && npx wp-env --config .wp-env.test.json stop)'
);
