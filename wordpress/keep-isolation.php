<?php
/**
 * Keeps core's Document-Isolation-Policy header while the wasm-vips-nothreads-demo plugin is active, when the
 * `wasm_vips_nothreads_keep_isolation` option is set. scripts/wordpress-test.ts sets the option with WP-CLI.
 *
 * @package wasm-vips-nothreads
 */

add_action(
	'admin_init',
	static function () {
		if ( get_option( 'wasm_vips_nothreads_keep_isolation' ) ) {
			remove_action( 'admin_init', 'wasm_vips_nothreads_demo_remove_isolation' );
		}
	},
	9
);
