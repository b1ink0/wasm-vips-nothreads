/**
 * WordPress.org release steps for the plugin.
 *
 * Usage: node scripts/plugin.ts assets|zip
 *        assets renders the PNG icons in .wordpress-org/ from icon.svg.
 *        zip checks that the versions in load.php and readme.txt match, copies the plugin without
 *        .wordpress-org/ to build/<slug>/ and zips it, like the Performance Lab build, with its
 *        SHA-256 next to it. Needs npm run wordpress worker first.
 * Output: plugins/<slug>/.wordpress-org/*.png, or build/<slug>/, build/<slug>-<version>.zip and
 *         build/<slug>-<version>.zip.sha256
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	cpSync,
	existsSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const ROOT = join( import.meta.dirname, '..' );
const SLUG = 'wasm-vips-nothreads-demo';
const PLUGIN = join( ROOT, 'plugins', SLUG );
const ASSETS = join( PLUGIN, '.wordpress-org' );
const step = process.argv[ 2 ];

if ( step === 'assets' ) {
	// The sizes WordPress.org shows: https://developer.wordpress.org/plugins/wordpress-org/plugin-assets/
	const sizes = [
		[ 'icon', 128, 128 ],
		[ 'icon', 256, 256 ],
	] as const;
	const browser = await chromium.launch();
	for ( const [ name, width, height ] of sizes ) {
		const page = await browser.newPage( { viewport: { width, height } } );
		await page.setContent(
			`<style>body { margin: 0 } svg { display: block; width: 100vw; height: 100vh }</style>${ readFileSync( join( ASSETS, `${ name }.svg` ), 'utf8' ) }`
		);
		await page.screenshot( {
			path: join( ASSETS, `${ name }-${ width }x${ height }.png` ),
		} );
		await page.close();
		console.log(
			`wrote .wordpress-org/${ name }-${ width }x${ height }.png`
		);
	}
	await browser.close();
} else if ( step === 'zip' ) {
	if ( ! existsSync( join( PLUGIN, 'build/worker.min.js' ) ) ) {
		throw new Error(
			'build/worker.min.js is missing, run npm run wordpress worker first'
		);
	}
	const load = readFileSync( join( PLUGIN, 'load.php' ), 'utf8' );
	const version = load.match( /^ \* Version: (\S+)$/m )?.[ 1 ];
	const versions = [
		load.match( /'WASM_VIPS_NOTHREADS_DEMO_VERSION', '([^']+)'/ )?.[ 1 ],
		readFileSync( join( PLUGIN, 'readme.txt' ), 'utf8' ).match(
			/^Stable tag:\s+(\S+)$/m
		)?.[ 1 ],
	];
	if ( ! version || versions.some( ( v ) => v !== version ) ) {
		throw new Error(
			`Version ${ version } in load.php does not match WASM_VIPS_NOTHREADS_DEMO_VERSION ${ versions[ 0 ] } or the Stable tag ${ versions[ 1 ] } in readme.txt`
		);
	}
	const out = join( ROOT, 'build', SLUG );
	const zip = `${ SLUG }-${ version }.zip`;
	rmSync( out, { recursive: true, force: true } );
	rmSync( join( ROOT, 'build', zip ), { force: true } );
	cpSync( PLUGIN, out, {
		recursive: true,
		filter: ( source ) => ! source.startsWith( ASSETS ),
	} );
	execFileSync( 'zip', [ '-r', '-X', '-q', zip, SLUG ], {
		cwd: join( ROOT, 'build' ),
	} );
	// In the sha256sum format, so shasum -a 256 -c checks the download.
	const hash = createHash( 'sha256' )
		.update( readFileSync( join( ROOT, 'build', zip ) ) )
		.digest( 'hex' );
	writeFileSync(
		join( ROOT, 'build', `${ zip }.sha256` ),
		`${ hash }  ${ zip }\n`
	);
	console.log( `wrote build/${ zip } and build/${ zip }.sha256` );
} else {
	throw new Error( 'Usage: node scripts/plugin.ts assets|zip' );
}
