/**
 * Writes the committed test inputs: a 24 MP and a 50 MP photo-like JPEG made from seeded noise
 * with the published wasm-vips 0.0.19, so the same bytes come out on every machine.
 *
 * Usage: node scripts/images.ts (after npm run setup)
 * Output: images/input.jpg (6000x4000) and images/input-8660x5773.jpg.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join( import.meta.dirname, '..' );
const { default: Vips } = await import(
	pathToFileURL( join( ROOT, 'src/npm-0.0.19/lib/vips-node.mjs' ) ).href
);
const vips = await Vips( { dynamicLibraries: [] } );

for ( const [ file, width, height ] of [
	[ 'input.jpg', 6000, 4000 ],
	[ 'input-8660x5773.jpg', 8660, 5773 ],
] as const ) {
	const noise = vips.Image.gaussnoise( width, height, {
		sigma: 60,
		mean: 128,
		seed: 42,
	} ).gaussblur( 3 );
	const image = noise
		.bandjoin( [ noise.linear( 0.8, 20 ), noise.linear( 0.6, 40 ) ] )
		.cast( 'uchar' );
	writeFileSync(
		join( ROOT, 'images', file ),
		image.jpegsaveBuffer( { Q: 90 } )
	);
	console.log( `wrote images/${ file }` );
}
