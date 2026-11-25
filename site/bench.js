// Browser benchmark, shared by plain/index.html and iso/index.html.
// Query: lib=baseline|nothreads, jobs, iters, avif=1, input=<file in images/>, only=<size>.<format>,...
const p = new URLSearchParams( location.search );
const lib = p.get( 'lib' ) || 'nothreads';
const jobs = Number( p.get( 'jobs' ) || 1 );
const iters = Number( p.get( 'iters' ) || 5 );
const avif = p.get( 'avif' ) === '1';

const SIZES = [
	[ 'thumbnail', 150, 150, true ],
	[ 'medium', 300, 300, false ],
	[ 'medium_large', 768, 0, false ],
	[ 'large', 1024, 1024, false ],
	[ '1536x1536', 1536, 1536, false ],
	[ '2048x2048', 2048, 2048, false ],
];
const formats = avif ? [ 'jpeg', 'webp', 'avif' ] : [ 'jpeg', 'webp' ];
const only = p.get( 'only' )?.split( ',' );
const tasks = SIZES.flatMap( ( s ) =>
	formats.map( ( f ) => [ ...s, f ] )
).filter(
	( [ name, , , , f ] ) => ! only || only.includes( `${ name }.${ f }` )
);
const buckets = [ ...Array( jobs ).keys() ].map( ( i ) =>
	tasks.filter( ( _, j ) => j % jobs === i )
);

const env = {
	userAgent: navigator.userAgent,
	hardwareConcurrency: navigator.hardwareConcurrency,
	crossOriginIsolated: self.crossOriginIsolated,
	sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
};

const call = ( w, msg ) =>
	new Promise( ( ok, fail ) => {
		w.onmessage = ( { data } ) =>
			data.error ? fail( new Error( data.error ) ) : ok( data );
		w.onerror = ( e ) => fail( new Error( e.message || 'worker error' ) );
		w.postMessage( msg );
	} );

const summary = document.getElementById( 'summary' );
const preview = document.getElementById( 'input' );
const file = document.getElementById( 'file' );
const outputs = document.getElementById( 'outputs' );
const log = document.getElementById( 'log' );

async function bench( input ) {
	file.disabled = true;
	outputs.textContent = 'The images appear here when the run finishes.';
	log.textContent = '';
	summary.textContent = `Running ${ lib }, ${ jobs } worker${ jobs > 1 ? 's' : '' }, ${ iters } iterations${ avif ? ', with AVIF' : '' }…`;
	try {
		const tInit = performance.now();
		// The worker and libs sit in iso/ so the isolated page's service worker also covers their requests.
		const workers = buckets.map(
			() =>
				new Worker( new URL( 'iso/worker.js', import.meta.url ), {
					type: 'module',
				} )
		);
		// Without cross-origin isolation the pthreads build never finishes initialising, so give up after 60s.
		const ready = await Promise.race( [
			Promise.all( workers.map( ( w ) => call( w, { lib, avif } ) ) ),
			new Promise( ( _, fail ) =>
				setTimeout(
					() => fail( new Error( 'init did not finish within 60s' ) ),
					60000
				)
			),
		] );
		const initMs = performance.now() - tInit;

		const once = ( hash ) =>
			Promise.all(
				workers.map( ( w, i ) =>
					call( w, { input, tasks: buckets[ i ], hash } )
				)
			);
		const warm = ( await once( true ) )
			.flatMap( ( r ) => r.results )
			.sort( ( a, b ) => a.task.localeCompare( b.task ) );
		const times = [];
		let heapMiB;
		for ( let i = 0; i < iters; i++ ) {
			const t0 = performance.now();
			heapMiB = ( await once( false ) ).map( ( r ) => r.heapMiB );
			times.push( performance.now() - t0 );
		}
		workers.forEach( ( w ) => w.terminate() );
		const sorted = [ ...times ].sort( ( a, b ) => a - b );
		window.result = {
			ok: true,
			env,
			lib,
			jobs,
			iters,
			avif,
			concurrency: ready[ 0 ].concurrency,
			initMs: Math.round( initMs ),
			medianMs: Math.round( sorted[ Math.floor( sorted.length / 2 ) ] ),
			minMs: Math.round( sorted[ 0 ] ),
			maxMs: Math.round( sorted.at( -1 ) ),
			times: times.map( Math.round ),
			heapMiB,
			totalHeapMiB: heapMiB.reduce( ( a, b ) => a + b, 0 ),
			outputs: warm.map( ( { out, ...r } ) => r ),
		};
		summary.textContent = `${ lib }: median ${ window.result.medianMs } ms for ${ tasks.length } sub-sizes, wasm heap ${ window.result.totalHeapMiB } MiB`;
		outputs.replaceChildren(
			...warm.map( ( { task, width, height, bytes, out } ) => {
				const url = URL.createObjectURL(
					new Blob( [ out ], {
						type: `image/${ task.split( '.' ).pop() }`,
					} )
				);
				const figure = document.createElement( 'figure' );
				figure.innerHTML = `<a href="${ url }" target="_blank"><img src="${ url }" alt="${ task }"></a><figcaption>${ task }, ${ width }x${ height }, ${ ( bytes / 1024 ).toFixed( 1 ) } KB</figcaption>`;
				return figure;
			} )
		);
	} catch ( e ) {
		window.result = {
			ok: false,
			env,
			lib,
			jobs,
			error: String( ( e && e.message ) || e ),
		};
		summary.textContent = `${ lib } failed: ${ window.result.error }`;
		outputs.textContent = 'No images, the run failed.';
	}
	log.textContent = JSON.stringify( window.result, null, 2 );
	file.disabled = false;
	// Lets the local runner collect results from browsers it cannot drive (--system).
	fetch( 'result', {
		method: 'POST',
		body: JSON.stringify( window.result ),
	} ).catch( () => {} );
}

file.onchange = async () => {
	preview.src = URL.createObjectURL( file.files[ 0 ] );
	await bench( new Uint8Array( await file.files[ 0 ].arrayBuffer() ) );
};

const url = new URL(
	`images/${ p.get( 'input' ) || 'input.jpg' }`,
	import.meta.url
);
preview.src = url;
await bench( new Uint8Array( await ( await fetch( url ) ).arrayBuffer() ) );
