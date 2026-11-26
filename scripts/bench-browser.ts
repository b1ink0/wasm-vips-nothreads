/**
 * Browser benchmark runner. Serves the bench site as scripts/deploy.ts lays it out, but with real
 * COOP/COEP headers on iso/, and runs each variant in Chromium, Firefox and WebKit.
 *
 * Usage: node scripts/bench-browser.ts [--browsers chromium,firefox,webkit] [--jobs 4] [--iters 5] [--avif]
 *          [--input <file in images/>] [--only 2048x2048.jpeg,...] [--concurrency <n>] [--label <name>]
 *        --system Safari,Firefox,"Google Chrome" opens the installed apps instead of Playwright browsers.
 * Output: results/browser-<browser>[-<label>].json
 */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { chromium, firefox, webkit, type Browser } from 'playwright';

type Result = {
	ok: boolean;
	error?: string;
	medianMs: number;
	minMs: number;
	maxMs: number;
	initMs: number;
	heapMiB: number[];
	env: { crossOriginIsolated: boolean; sharedArrayBuffer: boolean };
};

const ROOT = join( import.meta.dirname, '..' );
const { values: args } = parseArgs( {
	options: {
		browsers: { type: 'string', default: 'chromium,firefox,webkit' },
		system: { type: 'string' },
		jobs: { type: 'string', default: '4' },
		iters: { type: 'string', default: '5' },
		avif: { type: 'boolean', default: false },
		input: { type: 'string' },
		only: { type: 'string' },
		concurrency: { type: 'string' },
		label: { type: 'string' },
	},
} );
const query = new URLSearchParams( {
	iters: args.iters,
	avif: args.avif ? '1' : '0',
} );
if ( args.input ) {
	query.set( 'input', args.input );
}
if ( args.only ) {
	query.set( 'only', args.only );
}
if ( args.concurrency ) {
	query.set( 'concurrency', args.concurrency );
}
if ( args.system ) {
	query.set( 'report', '1' );
}

// Serves the same tree that scripts/deploy.ts publishes.
const LIBS: Record< string, string > = {
	baseline: 'src/baseline/lib',
	nothreads: 'src/nothreads/lib',
};
const TYPES: Record< string, string > = {
	'.html': 'text/html',
	'.css': 'text/css',
	'.js': 'text/javascript',
	'.wasm': 'application/wasm',
	'.jpg': 'image/jpeg',
};

// Pages POST their result next to themselves, which resolves this.
let onResult: ( ( result: Result ) => void ) | undefined;

const server = createServer( async ( req, res ) => {
	if ( req.method === 'POST' ) {
		let body = '';
		for await ( const chunk of req ) {
			body += chunk;
		}
		res.writeHead( 204 ).end();
		onResult?.( JSON.parse( body ) );
		return;
	}
	let path = new URL( req.url!, 'http://x' ).pathname;
	if ( path.endsWith( '/' ) ) {
		path += 'index.html';
	}
	const [ , top, lib, variant, ...rest ] = path.split( '/' );
	let file = join( ROOT, 'site', path );
	if ( top === 'images' ) {
		file = join( ROOT, path );
	} else if ( top === 'iso' && lib === 'lib' ) {
		file = join( ROOT, LIBS[ variant ], ...rest );
	}
	try {
		const body = await readFile( file );
		const headers: Record< string, string > = {
			'Content-Type':
				TYPES[ extname( file ) ] ?? 'application/octet-stream',
			'Cache-Control': 'no-store',
		};
		if ( top === 'iso' ) {
			Object.assign( headers, {
				'Cross-Origin-Opener-Policy': 'same-origin',
				'Cross-Origin-Embedder-Policy': 'require-corp',
				'Cross-Origin-Resource-Policy': 'same-origin',
			} );
		}
		res.writeHead( 200, headers ).end( body );
	} catch {
		res.writeHead( 404 ).end();
	}
} );
await new Promise< void >( ( ok ) => server.listen( 0, '127.0.0.1', ok ) );
const address = server.address();
const origin = `http://127.0.0.1:${ typeof address === 'object' && address?.port }`;

const jobs = args.jobs;
const RUNS = [
	[ 'baseline', 'iso', '1' ],
	[ 'baseline', 'iso', jobs ],
	[ 'baseline', 'plain', '1' ],
	[ 'nothreads', 'plain', '1' ],
	[ 'nothreads', 'plain', jobs ],
];

const system = args.system?.split( ',' ) ?? [];
for ( const name of system.length ? system : args.browsers.split( ',' ) ) {
	const browser: Browser | undefined = system.length
		? undefined
		: await (
				{ chromium, firefox, webkit } as Record<
					string,
					typeof chromium
				>
			 )[ name ].launch();
	const results = [];
	for ( const [ lib, mode, n ] of RUNS ) {
		const url = `${ origin }/${ mode }/?lib=${ lib }&jobs=${ n }&${ query }`;
		let result: Result;
		if ( browser ) {
			const page = await browser.newPage();
			await page.goto( url );
			await page.waitForFunction( () => ( window as any ).result, null, {
				timeout: 15 * 60 * 1000,
				polling: 500,
			} );
			result = await page.evaluate( () => ( window as any ).result );
			await page.close();
		} else {
			const posted = new Promise< Result >( ( ok ) => ( onResult = ok ) );
			execFileSync( 'open', [ '-a', name, url ] );
			result = await posted;
		}
		results.push( { variant: lib, isolation: mode, ...result } );
		console.log(
			`${ name.padEnd( 8 ) } ${ lib.padEnd( 9 ) } ${ mode.padEnd( 5 ) } jobs=${ n } ` +
				( result.ok
					? `median ${ result.medianMs } ms (min ${ result.minMs }, max ${ result.maxMs }) init ${ result.initMs } ms heap ${ result.heapMiB.join( '+' ) } MiB isolated=${ result.env.crossOriginIsolated }`
					: `FAILED isolated=${ result.env.crossOriginIsolated } sab=${ result.env.sharedArrayBuffer }: ${ result.error }` )
		);
	}
	await browser?.close();
	const file = system.length
		? `system-${ name.toLowerCase().replaceAll( ' ', '-' ) }`
		: name;
	await writeFile(
		join(
			ROOT,
			`results/browser-${ file }${ args.label ? `-${ args.label }` : '' }.json`
		),
		JSON.stringify( results, null, '\t' )
	);
}
server.close();
