/**
 * Node benchmark: WordPress-like sub-size generation from one large JPEG.
 * Tasks (each a thumbnail and an encode) are spread round-robin over N worker_threads,
 * each holding its own wasm-vips instance.
 *
 * Usage: node scripts/bench-node.ts --lib <dir with vips-node.mjs> --label <name>
 *          [--jobs N] [--concurrency C] [--iters K] [--avif] [--input <file in images/>] [--only 2048x2048.jpeg,...]
 * Output: results/node-<label>.json
 */
import {
	Worker,
	isMainThread,
	parentPort,
	workerData,
} from 'node:worker_threads';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

type Task = [
	name: string,
	width: number,
	height: number,
	crop: boolean,
	format: string,
];
type Output = {
	task: string;
	width: number;
	height: number;
	bytes: number;
	sha256: string;
};
type Batch = { results: Output[]; ms: number; heapMiB: number };

const ROOT = join( import.meta.dirname, '..' );

// WordPress default sizes: name, width, height, crop. 768x0 means no height limit.
const SIZES = [
	[ 'thumbnail', 150, 150, true ],
	[ 'medium', 300, 300, false ],
	[ 'medium_large', 768, 0, false ],
	[ 'large', 1024, 1024, false ],
	[ '1536x1536', 1536, 1536, false ],
	[ '2048x2048', 2048, 2048, false ],
] as const;

// Wasm memory only grows, so its size after a run is the peak heap of that wasm-vips instance.
let memory: WebAssembly.Memory | undefined;
const wasm = WebAssembly as unknown as Record<
	string,
	( source: unknown, imports?: WebAssembly.Imports ) => Promise< any >
>;
for ( const fn of [ 'instantiate', 'instantiateStreaming' ] ) {
	const original = wasm[ fn ];
	wasm[ fn ] = async ( source, imports ) => {
		const result = await original( source, imports );
		memory ??=
			( imports?.env?.memory as WebAssembly.Memory | undefined ) ??
			( result.instance ?? result ).exports.memory;
		return result;
	};
}

async function loadVips( lib: string, concurrency: number, avif: boolean ) {
	const { default: Vips } = await import(
		pathToFileURL( join( lib, 'vips-node.mjs' ) ).href
	);
	const vips = await Vips( {
		dynamicLibraries: avif ? [ 'vips-heif.wasm' ] : [],
	} );
	if ( concurrency ) {
		vips.concurrency( concurrency );
	}
	return vips;
}

function run(
	vips: any,
	input: Uint8Array,
	[ name, width, height, crop, format ]: Task
): Output {
	const image = vips.Image.thumbnailBuffer( input, width, {
		height: height || 10000000,
		...( crop ? { crop: 'centre' } : {} ),
	} );
	// Same save options as Gutenberg's @wordpress/vips (keep icc, AVIF effort 2).
	let out: Uint8Array;
	if ( format === 'jpeg' ) {
		out = image.jpegsaveBuffer( { Q: 82, keep: 'icc' } );
	} else if ( format === 'webp' ) {
		out = image.webpsaveBuffer( { Q: 86, keep: 'icc' } );
	} else {
		out = image.heifsaveBuffer( {
			Q: 52,
			compression: 'av1',
			effort: 2,
			keep: 'icc',
		} );
	}
	const result = {
		task: `${ name }.${ format }`,
		width: image.width,
		height: image.height,
		bytes: out.length,
		sha256: createHash( 'sha256' ).update( out ).digest( 'hex' ),
	};
	image.delete();
	return result;
}

if ( ! isMainThread ) {
	const { lib, concurrency, avif } = workerData;
	const vips = await loadVips( lib, concurrency, avif );
	parentPort!.postMessage( { concurrency: vips.concurrency() } );
	parentPort!.on(
		'message',
		( { input, tasks }: { input: Uint8Array; tasks: Task[] } ) => {
			const t0 = performance.now();
			const results = tasks.map( ( task ) => run( vips, input, task ) );
			const batch: Batch = {
				results,
				ms: performance.now() - t0,
				heapMiB: memory!.buffer.byteLength / 2 ** 20,
			};
			parentPort!.postMessage( batch );
		}
	);
} else {
	const { values: args } = parseArgs( {
		options: {
			lib: { type: 'string' },
			label: { type: 'string' },
			jobs: { type: 'string', default: '1' },
			concurrency: { type: 'string', default: '0' },
			iters: { type: 'string', default: '5' },
			avif: { type: 'boolean', default: false },
			input: { type: 'string', default: 'input.jpg' },
			only: { type: 'string' },
		},
	} );
	const lib = resolve( ROOT, args.lib! );
	const jobs = Number( args.jobs );
	const iters = Number( args.iters );
	const input = new Uint8Array(
		readFileSync( join( ROOT, 'images', args.input ) )
	);

	const formats = args.avif ? [ 'jpeg', 'webp', 'avif' ] : [ 'jpeg', 'webp' ];
	const tasks: Task[] = SIZES.flatMap( ( size ) =>
		formats.map( ( format ): Task => [ ...size, format ] )
	).filter(
		( [ name, , , , format ] ) =>
			! args.only ||
			args.only.split( ',' ).includes( `${ name }.${ format }` )
	);
	const buckets = [ ...Array( jobs ).keys() ].map( ( i ) =>
		tasks.filter( ( _, j ) => j % jobs === i )
	);

	const tInit = performance.now();
	const workers = await Promise.all(
		buckets.map(
			() =>
				new Promise< { worker: Worker; concurrency: number } >(
					( ok ) => {
						const worker = new Worker( import.meta.filename, {
							workerData: {
								lib,
								concurrency: Number( args.concurrency ),
								avif: args.avif,
							},
						} );
						worker.once( 'message', ( { concurrency } ) =>
							ok( { worker, concurrency } )
						);
					}
				)
		)
	);
	const initMs = performance.now() - tInit;

	const batch = () =>
		Promise.all(
			workers.map(
				( { worker }, i ) =>
					new Promise< Batch >( ( ok ) => {
						worker.once( 'message', ok );
						worker.postMessage( { input, tasks: buckets[ i ] } );
					} )
			)
		);

	// One warm-up batch, then the timed ones.
	await batch();
	const times: number[] = [];
	let last: Batch[] = [];
	for ( let i = 0; i < iters; i++ ) {
		const t0 = performance.now();
		last = await batch();
		times.push( performance.now() - t0 );
	}
	await Promise.all( workers.map( ( { worker } ) => worker.terminate() ) );

	const sorted = [ ...times ].sort( ( a, b ) => a - b );
	const heapMiB = last.map( ( b ) => b.heapMiB );
	const report = {
		label: args.label,
		lib: args.lib,
		input: args.input,
		jobs,
		concurrency: workers[ 0 ].concurrency,
		iters,
		avif: args.avif,
		cpus: cpus().length,
		heapMiB,
		totalHeapMiB: heapMiB.reduce( ( a, b ) => a + b, 0 ),
		node: process.version,
		initMs: Math.round( initMs ),
		medianMs: Math.round( sorted[ Math.floor( sorted.length / 2 ) ] ),
		minMs: Math.round( sorted[ 0 ] ),
		maxMs: Math.round( sorted.at( -1 )! ),
		times: times.map( Math.round ),
		outputs: last
			.flatMap( ( b ) => b.results )
			.sort( ( a, b ) => a.task.localeCompare( b.task ) ),
	};
	writeFileSync(
		join( ROOT, `results/node-${ args.label }.json` ),
		JSON.stringify( report, null, '\t' )
	);
	console.log(
		`${ args.label }: median ${ report.medianMs } ms (min ${ report.minMs }, max ${ report.maxMs }), init ${ report.initMs } ms, vips concurrency ${ report.concurrency }, jobs ${ jobs }, heap ${ heapMiB.join( '+' ) } MiB`
	);
}
