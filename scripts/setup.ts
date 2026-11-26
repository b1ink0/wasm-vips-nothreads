/**
 * Downloads and verifies the libvips release archive, then clones every source at its pinned commit: wasm-vips into src/baseline and src/nothreads (with
 * the patches), and the two Gutenberg packages the WordPress test rebuilds into src/gutenberg.
 * Safe to run again.
 *
 * Usage: node scripts/setup.ts
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join( import.meta.dirname, '..' );
const UPSTREAM = join( ROOT, 'upstream' );

const WASM_VIPS = {
	repo: 'https://github.com/kleisauke/wasm-vips.git',
	commit: '49ac4378f2df80e38f45491abeeac9b86dddbedd',
}; // v0.0.19
// The "gutenberg.sha" that wordpress-develop pins on its 7.2 branch (7.2-RC3).
const GUTENBERG = {
	repo: 'https://github.com/WordPress/gutenberg.git',
	commit: 'c5bdc7f4898ec98114cdccbe1cacec7a979b85cc',
};
// The upstream patches are committed, the release archive is downloaded. upstream/SHA256SUMS pins both.
const DOWNLOADS = {
	'vips-8.18.7.tar.xz':
		'https://github.com/libvips/libvips/releases/download/v8.18.7/vips-8.18.7.tar.xz',
};

function git( dir: string, ...args: string[] ): string {
	return execFileSync( 'git', [ '-C', dir, ...args ], {
		encoding: 'utf8',
	} ).trim();
}

/**
 * Clones one commit without history. `paths` limits the checkout to those folders.
 * @param dir
 * @param root0
 * @param root0.repo
 * @param root0.commit
 * @param paths
 */
function clone(
	dir: string,
	{ repo, commit }: { repo: string; commit: string },
	paths: string[] = []
) {
	if ( ! existsSync( join( dir, '.git' ) ) ) {
		mkdirSync( dir, { recursive: true } );
		git( dir, 'init', '-q' );
		git( dir, 'remote', 'add', 'origin', repo );
		if ( paths.length ) {
			git(
				dir,
				'sparse-checkout',
				'set',
				'--no-cone',
				...paths.map( ( p ) => `/${ p }/` )
			);
		}
		git(
			dir,
			'fetch',
			'-q',
			'--depth',
			'1',
			...( paths.length ? [ '--filter=blob:none' ] : [] ),
			'origin',
			commit
		);
		git( dir, 'checkout', '-q', 'FETCH_HEAD' );
	}
	if ( git( dir, 'rev-parse', 'HEAD' ) !== commit ) {
		throw new Error( `${ dir } is not at ${ commit }` );
	}
}

for ( const [ file, url ] of Object.entries( DOWNLOADS ) ) {
	if ( ! existsSync( join( UPSTREAM, file ) ) ) {
		console.log( `downloading ${ url }` );
		writeFileSync(
			join( UPSTREAM, file ),
			new Uint8Array( await ( await fetch( url ) ).arrayBuffer() )
		);
	}
}
for ( const line of readFileSync( join( UPSTREAM, 'SHA256SUMS' ), 'utf8' )
	.trim()
	.split( '\n' ) ) {
	const [ hash, file ] = line.split( /\s+/ );
	if (
		createHash( 'sha256' )
			.update( readFileSync( join( UPSTREAM, file ) ) )
			.digest( 'hex' ) !== hash
	) {
		throw new Error(
			`upstream/${ file } does not match upstream/SHA256SUMS`
		);
	}
}

for ( const variant of [ 'baseline', 'nothreads' ] ) {
	const dir = join( ROOT, 'src', variant );
	clone( dir, WASM_VIPS );
	try {
		git( dir, 'diff', '--quiet' );
	} catch {
		console.log( `src/${ variant }: already patched` );
		continue;
	}
	const patches = [
		'pin-vendored.patch',
		...( variant === 'nothreads' ? [ 'nothreads-wasm-vips.patch' ] : [] ),
	];
	for ( const patch of patches ) {
		git( dir, 'apply', join( ROOT, 'patches', patch ) );
		console.log( `src/${ variant }: applied patches/${ patch }` );
	}
}

clone( join( ROOT, 'src/gutenberg' ), GUTENBERG, [
	'packages/vips',
	'packages/worker-threads',
] );
console.log( 'setup done' );
