=== wasm-vips No Threads Demo ===

Contributors:      b1ink0
Tested up to:      7.2
Stable tag:        0.1.0
License:           GPLv2 or later
License URI:       https://www.gnu.org/licenses/gpl-2.0.html
Tags:              media, images, performance, client-side, webassembly

A demo: client-side image processing without cross-origin isolation.

== Description ==

WordPress 7.2 can process uploaded images in the browser instead of on the server. It uses wasm-vips, a WebAssembly build of the libvips image library. That build uses WebAssembly threads, and browsers only allow them on cross-origin isolated pages. Core isolates the editor with the `Document-Isolation-Policy` header, which only Chromium browsers support. Firefox and Safari keep processing images on the server.

This plugin swaps in a wasm-vips build compiled without threads. It needs no isolation, so:

* Firefox and Safari process images in the browser as well.
* The editor is no longer isolated, so embeds and iframes in it are not affected.

It is not meant to run alongside Client Side Media Everywhere.

The plugin only replaces the wasm-vips build. WordPress still decides which images to create and with which formats and quality.

This is a demo. The bundled worker is built from the `@wordpress/vips` package of WordPress 7.2, so a later WordPress release may need a plugin update.

== Installation ==

1. Upload the `wasm-vips-nothreads-demo` folder to the `/wp-content/plugins/` directory.
2. Activate the plugin through the **Plugins** screen in WordPress.

Client-side media processing needs a secure context, so the site must use HTTPS or run on `localhost`.

== Frequently Asked Questions ==

= Why does the build without threads not need isolation? =

Threads in WebAssembly share memory through `SharedArrayBuffer`, which browsers only expose on cross-origin isolated pages. A build without threads uses ordinary memory, so it runs on any page.

= Is it slower? =

About the same. In Chromium, Firefox and WebKit on desktop it runs within 4% of the build in core, in either direction, and creates byte-identical images. The build in core already limits libvips to one thread on the web, and WordPress runs all processing in one worker, so the build without threads does the same work on that one thread.

= Why does the plugin define a SharedArrayBuffer placeholder? =

WordPress checks for `SharedArrayBuffer` before it enables client-side processing, because the build in core needs it. On pages without one, the plugin defines a placeholder that throws when it is constructed, so the check passes. Code that only tests whether `SharedArrayBuffer` exists sees the placeholder.

= Where is the source code of the worker? =

`build/worker.min.js` is generated. Its source, the patches to wasm-vips and libvips, and the steps to rebuild it are in the plugin's GitHub repository. It bundles wasm-vips (MIT), libvips (LGPL-2.1-or-later) and the `@wordpress/vips` and `@wordpress/worker-threads` packages from Gutenberg (GPL-2.0-or-later).

== Changelog ==

= 0.1.0 =

* Initial release.
