/**
 * Downloads the committed test inputs, CC0 images from Wikimedia Commons, and checks them against
 * their SHA-256. The credits are in the README.
 *
 * Usage: node scripts/images.ts
 * Output: images/input.jpg (6016x4000), images/input-8685x5789.jpg, images/phone.jpg (4032x3024,
 *         EXIF orientation 6) and images/screenshot.png (2880x1628).
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join( import.meta.dirname, '..' );

for ( const [ file, url, sha256 ] of [
	[
		'input.jpg',
		'https://upload.wikimedia.org/wikipedia/commons/d/dd/Looking_down_Rue_du_Gros-Horloge%2C_with_balloons%2C_Rouen%2C_2024.jpg',
		'88bf28e4903f4dcf55197527a2f5294aa9a66a2af8e6e90ad7894bbf6b4bb6e3',
	],
	[
		'input-8685x5789.jpg',
		'https://upload.wikimedia.org/wikipedia/commons/4/42/Worcester_Guildhall_Assembly_Room.jpg',
		'b27be4c46c70f6338c5026781a73423b7b9f46eb9b11baa637cac02363d7d134',
	],
	[
		'phone.jpg',
		'https://upload.wikimedia.org/wikipedia/commons/5/53/20200801_021556_things_places_IMG_7366.jpg',
		'6be4ce1ae96ddd2e518a74617261bc26b865e3124853270125cce9a0b8160c06',
	],
	[
		'screenshot.png',
		'https://upload.wikimedia.org/wikipedia/commons/2/2c/Screenshot_Arc_Browser.png',
		'488e90b3147c17d7dcb7ed0f7187a50ecba8e54d33395ae39bce372ba42113e7',
	],
] ) {
	// Wikimedia asks automated clients for a User-Agent that names the client.
	const response = await fetch( url, {
		headers: { 'User-Agent': 'wasm-vips-nothreads-images/1.0' },
	} );
	const bytes = new Uint8Array( await response.arrayBuffer() );
	if ( createHash( 'sha256' ).update( bytes ).digest( 'hex' ) !== sha256 ) {
		throw new Error( `${ url } does not match its SHA-256` );
	}
	writeFileSync( join( ROOT, 'images', file ), bytes );
	console.log( `wrote images/${ file }` );
}
