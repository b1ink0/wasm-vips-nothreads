/**
 * Runs the unit tests of wasm-vips (test/unit) against one build: in Node with mocha, as
 * wasm-vips' CI does, then in Chromium, Firefox and WebKit through test/unit/index.html, served
 * without cross-origin isolation headers. The combined build also runs in each browser with the
 * isolation headers of test/unit/serve.json, since it takes the threaded path there.
 * The tests are not changed.
 * A hang ends a run after 20 minutes and is recorded, since a deadlock blocks the thread mocha
 * uses for its own timeouts.
 *
 * Usage: node scripts/wasm-vips-test.ts [nothreads|combined]. Needs npm run setup and npm run build first.
 * Output: results/wasm-vips-test.json, or results/wasm-vips-test-combined.json
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
	existsSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';

const ROOT = join( import.meta.dirname, '..' );
const VARIANT = process.argv[ 2 ] ?? 'nothreads';
const SRC = join( ROOT, `src/${ VARIANT }` );
const DIR = join( SRC, 'test/unit' );
const REPORT = join( DIR, 'mocha-report.json' );
const TIMEOUT_MS = 20 * 60 * 1000;

interface MochaTest {
	fullTitle: string;
	file: string;
	duration?: number;
	err: { message?: string };
}

interface MochaReport {
	tests: MochaTest[];
	pending: MochaTest[];
	failures: MochaTest[];
}

interface Test {
	file?: string;
	title: string;
	state: 'passed' | 'pending' | 'failed';
	durationMs?: number;
	error?: string;
}

const summary = ( tests: Test[] ) => ( {
	passed: tests.filter( ( test ) => test.state === 'passed' ).length,
	pending: tests.filter( ( test ) => test.state === 'pending' ).length,
	failed: tests.filter( ( test ) => test.state === 'failed' ).length,
} );

if ( ! existsSync( join( DIR, 'node_modules' ) ) ) {
	execFileSync( 'npm', [ 'install', '--no-audit', '--no-fund' ], {
		cwd: DIR,
		stdio: 'inherit',
	} );
}

const files = readdirSync( DIR ).filter( ( name ) =>
	/^test_.*\.js$/.test( name )
);

rmSync( REPORT, { force: true } );
// The same options as the "test" script in test/unit/package.json, with a JSON report.
const node = spawnSync(
	'npx',
	[
		'mocha',
		'-s',
		'5000',
		'-t',
		'120000',
		...files,
		'-r',
		'node-helper.js',
		'--reporter',
		'json',
		'--reporter-option',
		`output=${ REPORT }`,
	],
	{ cwd: DIR, stdio: 'inherit', timeout: TIMEOUT_MS, killSignal: 'SIGKILL' }
);
const report: MochaReport | undefined = existsSync( REPORT )
	? JSON.parse( readFileSync( REPORT, 'utf8' ) )
	: undefined;
const failed = new Set( report?.failures.map( ( test ) => test.fullTitle ) );
const pending = new Set( report?.pending.map( ( test ) => test.fullTitle ) );
const nodeTests: Test[] = ( report?.tests ?? [] ).map( ( test ) => {
	let state: Test[ 'state' ] = 'passed';
	if ( failed.has( test.fullTitle ) ) {
		state = 'failed';
	} else if ( pending.has( test.fullTitle ) ) {
		state = 'pending';
	}
	return {
		file: test.file.split( '/' ).pop(),
		title: test.fullTitle,
		state,
		durationMs: test.duration,
		error: test.err.message,
	};
} );
const runs = [
	{
		environment: `Node ${ process.version }`,
		mocha: JSON.parse(
			readFileSync(
				join( DIR, 'node_modules/mocha/package.json' ),
				'utf8'
			)
		).version,
		hung: node.error !== undefined || node.signal !== null,
		...summary( nodeTests ),
		tests: nodeTests,
	},
];

// Serves test/unit/index.html at / and its files the way test/unit/serve.json does, without its
// isolation headers. Under /iso/ it serves the same files with them.
const TYPES: Record< string, string > = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.wasm': 'application/wasm',
};
const ISOLATION = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp',
	'Cross-Origin-Resource-Policy': 'cross-origin',
};
const server = createServer( async ( req, res ) => {
	let path = new URL( req.url!, 'http://x' ).pathname;
	const isolated = path.startsWith( '/iso/' );
	if ( isolated ) {
		path = path.slice( 4 );
	}
	if ( path === '/' ) {
		path = '/index.html';
	}
	const file =
		path.lastIndexOf( '/' ) === 0 ? join( DIR, path ) : join( SRC, path );
	try {
		const body = await readFile( file );
		res.writeHead( 200, {
			'Content-Type':
				TYPES[ extname( file ) ] ?? 'application/octet-stream',
			...( isolated ? ISOLATION : {} ),
		} ).end( body );
	} catch {
		res.writeHead( 404 ).end();
	}
} );
await new Promise< void >( ( ok ) => server.listen( 0, '127.0.0.1', ok ) );
const address = server.address();
const origin = `http://127.0.0.1:${ typeof address === 'object' && address?.port }`;

const cases = [ chromium, firefox, webkit ].flatMap( ( type ) =>
	( VARIANT === 'combined' ? [ false, true ] : [ false ] ).map(
		( isolated ) => [ type, isolated ] as const
	)
);
for ( const [ type, isolated ] of cases ) {
	const browser = await type.launch();
	const tab = await browser.newPage();
	// Records each result from the runner that index.html starts with mocha.run().
	await tab.addInitScript( () => {
		const results: object[] = [];
		let mocha: any;
		Object.defineProperty( window, 'mocha', {
			configurable: true,
			get: () => mocha,
			set: ( value ) => {
				// mocha.min.js sets it more than once
				if ( value === mocha ) {
					return;
				}
				mocha = value;
				const run = value.run.bind( value );
				value.run = ( ...args: unknown[] ) => {
					const runner = run( ...args );
					for ( const state of [ 'pass', 'pending', 'fail' ] ) {
						runner.on( state, ( test: any, error?: Error ) =>
							results.push( {
								title: test.fullTitle(),
								state: {
									pass: 'passed',
									pending: 'pending',
									fail: 'failed',
								}[ state ],
								durationMs: test.duration,
								error: error?.message,
							} )
						);
					}
					runner.on( 'end', () => {
						( window as any ).results = results;
					} );
					return runner;
				};
			},
		} );
	} );
	await tab.goto( isolated ? `${ origin }/iso/` : origin );
	if ( ( await tab.evaluate( () => crossOriginIsolated ) ) !== isolated ) {
		throw new Error(
			`The test page must ${ isolated ? '' : 'not ' }be cross-origin isolated`
		);
	}
	let hung = false;
	try {
		await tab.waitForFunction( () => ( window as any ).results, null, {
			timeout: TIMEOUT_MS,
			polling: 1000,
		} );
	} catch {
		hung = true;
	}
	const tests: Test[] = hung
		? []
		: await tab.evaluate( () => ( window as any ).results );
	runs.push( {
		environment: `${ type.name() } ${ browser.version() }${
			isolated ? ' isolated' : ''
		}`,
		mocha: readFileSync( join( DIR, 'index.html' ), 'utf8' ).match(
			/mocha\/([\d.]+)\/mocha\.min\.js/
		)![ 1 ],
		hung,
		...summary( tests ),
		tests,
	} );
	await browser.close();
}
server.close();

writeFileSync(
	join(
		ROOT,
		`results/wasm-vips-test${
			VARIANT === 'nothreads' ? '' : `-${ VARIANT }`
		}.json`
	),
	JSON.stringify(
		{
			wasmVips: execFileSync( 'git', [ '-C', SRC, 'rev-parse', 'HEAD' ], {
				encoding: 'utf8',
			} ).trim(),
			runs,
		},
		null,
		'\t'
	) + '\n'
);
for ( const run of runs ) {
	console.log(
		run.environment.padEnd( 20 ),
		run.hung
			? `hung, stopped after ${ TIMEOUT_MS / 60000 } minutes`
			: `${ run.passed } passed, ${ run.pending } pending, ${ run.failed } failed`
	);
}
process.exit(
	runs.some( ( run ) => run.hung || run.failed > 0 || run.passed === 0 )
		? 1
		: 0
);
