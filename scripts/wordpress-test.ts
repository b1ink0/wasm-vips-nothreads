/**
 * Uploads each test image to an image block in Chromium, Firefox and WebKit, RUNS times per plugin
 * setup, each time in a fresh browser, and records whether the editor made the sub-sizes in the browser, how long
 * the upload took and how much memory the browser used.
 * Client-side processing uploads the original without sub-sizes, then sideloads each one, so a
 * sideload request means the browser made that sub-size.
 *
 * Usage: node scripts/wordpress-test.ts [--browsers chromium,firefox,webkit]. Needs npm run wordpress first.
 * Output: results/wordpress.json
 */
import { execFile, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs, promisify } from 'node:util';
import { chromium, firefox, webkit, type Page } from 'playwright';

const ROOT = join( import.meta.dirname, '..' );
const SITE = 'http://localhost:8889';
const CSME_VERSION = '1.3.0';
const IMAGES = [ 'images/input.jpg', 'images/input-8660x5773.jpg' ];
// Uploads of each image per setup and browser. Memory use varies between runs.
const RUNS = 3;
// Plugins active in each setup. client-side-media-everywhere sends COOP/COEP where Document-Isolation-Policy is missing.
const SETUPS: Record< string, string[] > = {
	core: [],
	csme: [ 'client-side-media-everywhere' ],
	'wasm-vips-nothreads-demo': [ 'wasm-vips-nothreads-demo' ],
};
const { values: args } = parseArgs( {
	options: {
		browsers: { type: 'string', default: 'chromium,firefox,webkit' },
	},
} );

function wp( ...command: string[] ): string {
	return execFileSync(
		'docker',
		[
			'compose',
			'-f',
			'wordpress/compose.yml',
			'exec',
			'-T',
			'cli',
			'wp',
			...command,
		],
		{ cwd: ROOT, encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'ignore' ] }
	).trim();
}

/**
 * Resident memory of every process of the browser, in MiB. WebKit starts its web content process
 * as an XPC service outside the browser's process tree, so processes are matched by install folder.
 * @param name Browser name.
 */
async function memory( name: string ): Promise< number > {
	const { stdout } = await promisify( execFile )( 'ps', [
		'-A',
		'-o',
		'rss=,command=',
	] );
	const kib = stdout
		.split( '\n' )
		.filter( ( line ) => line.includes( `/ms-playwright/${ name }` ) )
		.reduce( ( sum, line ) => sum + parseInt( line ), 0 );
	return Math.round( kib / 1024 );
}

async function upload( page: Page, name: string, image: string ) {
	const requests = { media: 0, sideload: 0 };
	// WordPress terminates the vips worker when the queue is empty, so count the workers started.
	let workers = 0;
	page.on( 'worker', () => workers++ );
	page.on( 'request', ( request ) => {
		const url = decodeURIComponent( request.url() );
		if (
			request.method() === 'POST' &&
			/wp\/v2\/media\/\d+\/sideload/.test( url )
		) {
			requests.sideload++;
		} else if (
			request.method() === 'POST' &&
			/wp\/v2\/media(\?|&|$)/.test( url )
		) {
			requests.media++;
		}
	} );
	const console: string[] = [];
	page.on( 'console', ( message ) => {
		if ( /client-side|vips|SharedArrayBuffer/i.test( message.text() ) ) {
			console.push( message.text() );
		}
	} );

	const response = await page.goto( `${ SITE }/wp-admin/post-new.php` );
	const headers = await response!.allHeaders();
	// Blocks inserted before the canvas renders are dropped when the editor sets up the post.
	const canvas = page.frameLocator( 'iframe[name="editor-canvas"]' );
	await canvas.locator( '.editor-post-title' ).waitFor();
	const env = await page.evaluate( () => {
		const w = window as any;
		w.wp.data
			.dispatch( 'core/preferences' )
			.set( 'core/edit-post', 'welcomeGuide', false );
		w.wp.data
			.dispatch( 'core/block-editor' )
			.insertBlocks( w.wp.blocks.createBlock( 'core/image' ) );
		return {
			crossOriginIsolated: self.crossOriginIsolated,
			clientSideFlag: Boolean( w.__clientSideMediaProcessing ),
			userAgent: navigator.userAgent,
		};
	} );

	const mem = { idle: await memory( name ), peak: 0, after: 0 };
	let sampling = true;
	const sampler = ( async () => {
		while ( sampling ) {
			mem.peak = Math.max( mem.peak, await memory( name ) );
			await sleep( 100 );
		}
	} )();

	const t0 = Date.now();
	await canvas
		.locator( '.wp-block-image input[type="file"]' )
		.first()
		.setInputFiles( join( ROOT, image ) );
	// Done when the block has its attachment and the upload queue is empty, or when the editor shows an error.
	const done = await page
		.waitForFunction(
			() => {
				const w = window as any;
				const notice = w.wp.data
					.select( 'core/notices' )
					.getNotices()
					.find( ( n: any ) => n.status === 'error' );
				if ( notice ) {
					return { error: notice.content };
				}
				const block = w.wp.data
					.select( 'core/block-editor' )
					.getBlocks()[ 0 ];
				const queue =
					w.wp.data.select( 'core/upload-media' )?.getItems?.() ?? [];
				return (
					block?.attributes.id &&
					! block.attributes.url?.startsWith( 'blob:' ) &&
					queue.length === 0 && { error: null }
				);
			},
			null,
			{ timeout: 10 * 60 * 1000, polling: 100 }
		)
		.then( ( handle ) => handle.jsonValue() )
		.finally( () => ( sampling = false ) );
	if ( done.error ) {
		throw new Error( done.error );
	}
	const ms = Date.now() - t0;
	await sampler;
	mem.after = await memory( name );
	const id = await page.evaluate(
		() =>
			( window as any ).wp.data
				.select( 'core/block-editor' )
				.getBlocks()[ 0 ].attributes.id
	);
	return {
		env,
		headers: {
			dip: headers[ 'document-isolation-policy' ] ?? null,
			coep: headers[ 'cross-origin-embedder-policy' ] ?? null,
			coop: headers[ 'cross-origin-opener-policy' ] ?? null,
		},
		id,
		ms,
		memory: mem,
		workers,
		requests,
		console,
	};
}

wp(
	'plugin',
	'install',
	'client-side-media-everywhere',
	`--version=${ CSME_VERSION }`,
	'--force'
);
const results = [];
for ( const [ setup, plugins ] of Object.entries( SETUPS ) ) {
	wp( 'plugin', 'deactivate', '--all' );
	if ( plugins.length ) {
		wp( 'plugin', 'activate', ...plugins );
	}
	for ( const name of args.browsers.split( ',' ) ) {
		for ( const image of IMAGES.flatMap( ( path ) =>
			Array( RUNS ).fill( path )
		) ) {
			const browser = await (
				{ chromium, firefox, webkit } as Record<
					string,
					typeof chromium
				>
			 )[ name ].launch();
			const page = await browser.newPage();
			// page.request shares the page's cookies.
			await page.request.post( `${ SITE }/wp-login.php`, {
				form: { log: 'admin', pwd: 'password' },
			} );
			let result;
			try {
				const run = await upload( page, name, image );
				const metadata = JSON.parse(
					wp(
						'post',
						'meta',
						'get',
						String( run.id ),
						'_wp_attachment_metadata',
						'--format=json'
					)
				);
				result = {
					setup,
					browser: name,
					image,
					ok: true,
					...run,
					clientSide: run.requests.sideload > 0,
					sizes: Object.keys( metadata.sizes ?? {} ),
					originalImage: metadata.original_image ?? null,
					width: metadata.width,
					height: metadata.height,
				};
			} catch ( e ) {
				result = {
					setup,
					browser: name,
					image,
					ok: false,
					error: String( ( e as Error ).message ).split( '\n' )[ 0 ],
				};
			}
			await browser.close();
			results.push( result );
			console.log(
				`${ setup.padEnd( 23 ) } ${ name.padEnd( 8 ) } ${ image.padEnd( 27 ) } ` +
					( 'ms' in result
						? `${ result.ms } ms isolated=${ result.env.crossOriginIsolated } clientSide=${ result.clientSide } sideloads=${ result.requests.sideload } sizes=${ result.sizes.length } ${ result.width }x${ result.height } dip=${ result.headers.dip } coep=${ result.headers.coep } memory=${ result.memory.idle }/${ result.memory.peak }/${ result.memory.after } MiB workers=${ result.workers }`
						: `FAILED ${ result.error }` )
			);
		}
	}
}
wp( 'plugin', 'deactivate', '--all' );
writeFileSync(
	join( ROOT, 'results/wordpress.json' ),
	JSON.stringify( results, null, '\t' )
);
