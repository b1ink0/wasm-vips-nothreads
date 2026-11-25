/**
 * Publishes the bench site to the gh-pages branch, with the built libs, the test inputs, the
 * plugin zip and a WordPress Playground Blueprint that installs it, so built files never land
 * on the main branch and no CI is needed. GitHub Pages sends CORS headers, so Playground can
 * download the zip from there.
 *
 * Usage: node scripts/deploy.ts [--dry-run]. Needs npm run build and npm run plugin:zip first.
 *        --dry-run only assembles build/pages/.
 */
import {
	cpSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { publish } from 'gh-pages';

const ROOT = join( import.meta.dirname, '..' );
const OUT = join( ROOT, 'build/pages' );
const SITE = 'https://b1ink0.github.io/wasm-vips-nothreads';
const version = readFileSync(
	join( ROOT, 'plugins/wasm-vips-nothreads-demo/load.php' ),
	'utf8'
).match( /^ \* Version: (\S+)$/m )?.[ 1 ];
const zip = `wasm-vips-nothreads-demo-${ version }.zip`;

rmSync( OUT, { recursive: true, force: true } );
cpSync( join( ROOT, 'site' ), OUT, { recursive: true } );
cpSync( join( ROOT, 'images' ), join( OUT, 'images' ), { recursive: true } );
for ( const variant of [ 'baseline', 'nothreads' ] ) {
	mkdirSync( join( OUT, 'iso/lib', variant ), { recursive: true } );
	for ( const file of [ 'vips-es6.js', 'vips.wasm', 'vips-heif.wasm' ] ) {
		cpSync(
			join( ROOT, 'src', variant, 'lib', file ),
			join( OUT, 'iso/lib', variant, file )
		);
	}
}
cpSync( join( ROOT, 'build', zip ), join( OUT, zip ) );
// WordPress 7.2 is in its release cycle, so "beta" resolves to its latest beta or RC.
writeFileSync(
	join( OUT, 'blueprint.json' ),
	JSON.stringify(
		{
			$schema: 'https://playground.wordpress.net/blueprint-schema.json',
			landingPage: '/wp-admin/post-new.php',
			preferredVersions: { php: '8.4', wp: 'beta' },
			login: true,
			steps: [
				{
					step: 'installPlugin',
					pluginData: { resource: 'url', url: `${ SITE }/${ zip }` },
				},
			],
		},
		null,
		'\t'
	)
);
writeFileSync( join( OUT, '.nojekyll' ), '' );

if ( process.argv.includes( '--dry-run' ) ) {
	console.log( 'assembled build/pages/' );
} else {
	await publish( OUT, {
		dotfiles: true,
		history: false,
		message: 'Deploy the bench site',
	} );
	console.log( 'published build/pages/ to gh-pages' );
}
