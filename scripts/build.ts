/**
 * Builds the toolchain image once, then each wasm-vips variant inside it.
 *
 * Usage: node scripts/build.ts [baseline|nothreads ...]. With no variant, builds both.
 * Output: src/<variant>/lib/ and results/build-<variant>.log.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { join } from 'node:path';

const ROOT = join( import.meta.dirname, '..' );
const IMAGE = 'wasm-vips-nothreads-env';
// Same flags for both variants. SVG (resvg) is off because its Rust build needs +atomics.
const BUILD_ARGS = [ '--disable-svg' ];
const variants = process.argv.slice( 2 ).length
	? process.argv.slice( 2 )
	: [ 'baseline', 'nothreads' ];

// The wasm-vips Dockerfile and build.sh (see patches/pin-vendored.patch) read upstream/ as /vendor.
execFileSync(
	'docker',
	[
		'build',
		'-t',
		IMAGE,
		'--build-context',
		'vendor=upstream',
		'src/baseline',
	],
	{ cwd: ROOT, stdio: 'inherit' }
);

for ( const variant of variants ) {
	// Emscripten's cache lock uses flock, which does not hold across processes on a
	// Docker Desktop bind mount, so that cache lives on a Docker volume instead.
	const build = spawn(
		'docker',
		[
			'run',
			'--rm',
			'-v',
			`wasm-vips-nothreads-emcache-${ variant }:/emcache`,
			'-e',
			'EM_CACHE=/emcache',
			'-v',
			`${ ROOT }/src/${ variant }:/src`,
			'-v',
			`${ ROOT }/upstream:/vendor:ro`,
			'-v',
			`${ ROOT }/patches:/patches:ro`,
			IMAGE,
			'./build.sh',
			...BUILD_ARGS,
		],
		{ cwd: ROOT }
	);
	// stdout and stderr both go to the console and to one log, as the compiler warnings are part of the record.
	const log = createWriteStream(
		join( ROOT, `results/build-${ variant }.log` )
	);
	for ( const stream of [ build.stdout, build.stderr ] ) {
		stream.on( 'data', ( chunk ) => {
			process.stdout.write( chunk );
			log.write( chunk );
		} );
	}
	const [ code ] = await once( build, 'close' );
	log.end();
	if ( code !== 0 ) {
		throw new Error(
			`build of ${ variant } failed, see results/build-${ variant }.log`
		);
	}
	console.log( `built ${ variant }` );
}
