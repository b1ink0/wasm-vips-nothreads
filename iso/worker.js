// One wasm-vips instance per worker. Same tasks and save options as scripts/bench-node.ts.
let vips;

// Wasm memory only grows, so its size after a run is the peak heap of this wasm-vips instance.
let memory;
for ( const fn of [ 'instantiate', 'instantiateStreaming' ] ) {
	const original = WebAssembly[ fn ];
	WebAssembly[ fn ] = async ( source, imports ) => {
		const result = await original( source, imports );
		memory ??=
			imports?.env?.memory ??
			( result.instance ?? result ).exports.memory;
		return result;
	};
}

function run( [ name, w, h, crop, format ], input ) {
	const img = vips.Image.thumbnailBuffer( input, w, {
		height: h || 10000000,
		...( crop ? { crop: 'centre' } : {} ),
	} );
	let out;
	if ( format === 'jpeg' ) {
		out = img.jpegsaveBuffer( { Q: 82, keep: 'icc' } );
	} else if ( format === 'webp' ) {
		out = img.webpsaveBuffer( { Q: 86, keep: 'icc' } );
	} else {
		out = img.heifsaveBuffer( {
			Q: 82,
			compression: 'av1',
			effort: 2,
			keep: 'icc',
		} );
	}
	const result = {
		task: `${ name }.${ format }`,
		width: img.width,
		height: img.height,
		out,
	};
	img.delete();
	return result;
}

const hex = ( buf ) =>
	[ ...new Uint8Array( buf ) ]
		.map( ( b ) => b.toString( 16 ).padStart( 2, '0' ) )
		.join( '' );

onmessage = async ( { data } ) => {
	try {
		if ( data.lib ) {
			const { default: Vips } = await import(
				`./lib/${ data.lib }/vips-es6.js`
			);
			vips = await Vips( {
				dynamicLibraries: data.avif ? [ 'vips-heif.wasm' ] : [],
			} );
			if ( data.concurrency ) {
				vips.concurrency( data.concurrency );
			}
			postMessage( { ready: true, concurrency: vips.concurrency() } );
			return;
		}
		const t0 = performance.now();
		const results = data.tasks.map( ( t ) => run( t, data.input ) );
		const ms = performance.now() - t0;
		if ( data.hash ) {
			for ( const r of results ) {
				r.bytes = r.out.length;
				r.sha256 = hex(
					await crypto.subtle.digest( 'SHA-256', r.out )
				);
			}
		}
		postMessage( {
			ms,
			heapMiB: memory.buffer.byteLength / 2 ** 20,
			results: data.hash ? results : [],
		} );
	} catch ( e ) {
		postMessage( { error: String( ( e && e.stack ) || e ) } );
	}
};
