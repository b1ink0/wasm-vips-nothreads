<?php
/**
 * Hook callbacks used for wasm-vips No Threads Demo.
 *
 * @package wasm-vips-nothreads-demo
 */

declare( strict_types = 1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

/**
 * Replaces the @wordpress/vips/worker script module with the build that uses wasm-vips without threads.
 *
 * Core registers the module in wp_default_script_modules() on wp_default_scripts at priority 10.
 */
function wasm_vips_nothreads_demo_register_worker(): void {
	wp_deregister_script_module( '@wordpress/vips/worker' );
	wp_register_script_module(
		'@wordpress/vips/worker',
		plugin_dir_url( __FILE__ ) . 'build/worker.min.js',
		array(),
		WASM_VIPS_NOTHREADS_DEMO_VERSION
	);
}
add_action( 'wp_default_scripts', 'wasm_vips_nothreads_demo_register_worker', 11 );

/**
 * Stops core from sending the Document-Isolation-Policy header, which this build does not need.
 *
 * Core hooks wp_set_up_cross_origin_isolation() to these screens. admin_init runs before them.
 */
function wasm_vips_nothreads_demo_remove_isolation(): void {
	foreach ( array( 'load-post.php', 'load-post-new.php', 'load-site-editor.php', 'load-widgets.php', 'load-upload.php', 'load-media-new.php' ) as $hook ) {
		remove_action( $hook, 'wp_set_up_cross_origin_isolation' );
	}
}
add_action( 'admin_init', 'wasm_vips_nothreads_demo_remove_isolation' );

/**
 * Defines a placeholder SharedArrayBuffer on pages without one.
 *
 * The detectClientSideMediaSupport() check in @wordpress/upload-media rejects pages without SharedArrayBuffer.
 * Only the threaded wasm-vips needs it, so the placeholder stands in for removing that check.
 * Constructing it throws, and the vips worker has its own global scope where it is not defined.
 */
function wasm_vips_nothreads_demo_add_shared_array_buffer_placeholder(): void {
	wp_add_inline_script(
		'wp-upload-media',
		"if ( typeof SharedArrayBuffer === 'undefined' ) { window.SharedArrayBuffer = function SharedArrayBuffer() { throw new TypeError( 'SharedArrayBuffer is not available' ); }; }",
		'before'
	);
}
add_action( 'admin_init', 'wasm_vips_nothreads_demo_add_shared_array_buffer_placeholder' );
