<?php
/**
 * Plugin Name: wasm-vips No Threads Demo
 * Description: Demo of client-side image processing with a wasm-vips build without threads.
 * Requires at least: 7.2
 * Requires PHP: 7.4
 * Version: 0.1.0
 * Author: b1ink0
 * License: GPLv2 or later
 * License URI: https://www.gnu.org/licenses/old-licenses/gpl-2.0.html
 * Text Domain: wasm-vips-nothreads-demo
 *
 * @package wasm-vips-nothreads-demo
 */

declare( strict_types = 1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

if ( defined( 'WASM_VIPS_NOTHREADS_DEMO_VERSION' ) ) {
	return;
}

define( 'WASM_VIPS_NOTHREADS_DEMO_VERSION', '0.1.0' );

require_once __DIR__ . '/hooks.php';
