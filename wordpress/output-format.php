<?php
/**
 * Saves JPEG and PNG uploads in the format stored in the `wasm_vips_nothreads_output_format` option,
 * through the `image_editor_output_format` filter. scripts/wordpress-test.ts sets the option with WP-CLI.
 * Without the option, WordPress keeps its default output formats.
 *
 * @package wasm-vips-nothreads
 */

add_filter(
	'image_editor_output_format',
	static function ( $formats ) {
		$format = get_option( 'wasm_vips_nothreads_output_format' );
		if ( ! $format ) {
			return $formats;
		}
		return array(
			'image/jpeg' => $format,
			'image/png'  => $format,
		) + $formats;
	}
);
