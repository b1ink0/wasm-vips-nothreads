# WordPress plugin

[`plugins/wasm-vips-nothreads-demo`](../plugins/wasm-vips-nothreads-demo) makes WordPress 7.2 process uploaded images in the browser in Chromium, Firefox and WebKit, without cross-origin isolation. The results come from [`results/wordpress.json`](../results/wordpress.json), written by `npm run wordpress:test`, except the phone sections.

## What it changes

All changes are in [`hooks.php`](../plugins/wasm-vips-nothreads-demo/hooks.php).

| Change | How |
|---|---|
| Replaces the vips worker | Registers `build/worker.min.js` as the `@wordpress/vips/worker` script module on `wp_default_scripts` at priority 11, after core registers its own at priority 10. |
| Stops `Document-Isolation-Policy` | Removes `wp_set_up_cross_origin_isolation` from the `load-*` hooks of the editor and media screens on `admin_init`. |
| Lets the support check pass | Adds an inline script before `wp-upload-media` that defines a placeholder `SharedArrayBuffer` when the page has none. |

`build/worker.min.js` is built by `npm run wordpress worker` from the `@wordpress/vips` and `@wordpress/worker-threads` sources of WordPress 7.2 RC3, bundled with the build without threads.

## Test

`npm run wordpress` starts WordPress 7.2 RC3 in Docker at http://localhost:8889 with the plugin mounted. `npm run wordpress:test` then activates only the plugins of each setup and, for each output format and browser, uploads each input 3 times, each time in a fresh browser:

1. Logs in, opens a new post and inserts an image block.
2. Uploads the input to the block.
3. Waits until the block has its attachment and the upload queue is empty, or until the editor shows an error notice.
4. Reads the attachment metadata through WP-CLI, then deletes the attachment.

The inputs, all from Wikimedia Commons (credits in the [README](../README.md#test-photos)):

| Input | Image |
|---|---|
| `images/input.jpg` | Camera photo, 6016 × 4000 (24 MP), 13 MB |
| `images/input-8685x5789.jpg` | Camera photo, 8685 × 5789 (50 MP), 33 MB |
| `images/phone.jpg` | iPhone photo, 4032 × 3024 with EXIF orientation 6 |
| `images/screenshot.png` | Screenshot, 2880 × 1628 PNG |

The output formats:

| Format | How |
|---|---|
| Default | WordPress keeps JPEG as JPEG and PNG as PNG. |
| WebP | [`wordpress/output-format.php`](../wordpress/output-format.php), a must-use plugin, maps JPEG and PNG to WebP through the core `image_editor_output_format` filter. |
| AVIF | The same, with AVIF. |

When the browser processes the image, the editor uploads the original and then sends one `POST /wp/v2/media/<id>/sideload` request for each image it made. A run counts as client-side when it sent at least one sideload request.

Memory is the resident memory (RSS) of every process of the browser, read with `ps` every 100 ms during the upload. The rise is the peak during the upload minus the value just before it. It covers the page, the vips worker and its threads, and the browser's other processes, so it varies between runs.

The setups:

| Setup | Active plugins |
|---|---|
| core | None |
| csme | [Client Side Media Everywhere](https://wordpress.org/plugins/client-side-media-everywhere/) 1.3.0, which sends COOP and COEP headers where `Document-Isolation-Policy` is not supported |
| wasm-vips-nothreads-demo | wasm-vips No Threads Demo |

Playwright 1.64.0 with Chromium 156, Firefox 157 and WebKit (Safari 27.2), headless on an Apple M3 with macOS 15.8.2.

## Results

Each cell is the median of the runs that finished, out of 3: the time from choosing the file to the end of the upload, then the rise in browser memory. In core, Firefox and WebKit process the image on the server, marked (server). Every other run processes it in the browser.

### Default output

| Input | Setup | Chromium | Firefox | WebKit |
|---|---|---|---|---|
| 24 MP | core | 3799 ms, 470 MiB | 4427 ms, 28 MiB (server) | 4591 ms, 59 MiB (server) |
| | csme | 5137 ms, 664 MiB | 9249 ms, 587 MiB | 9555 ms, 735 MiB |
| | wasm-vips-nothreads-demo | 3849 ms, 436 MiB | 5558 ms, 298 MiB | 5084 ms, 281 MiB |
| 50 MP | core | 5767 ms, 863 MiB | 13481 ms, 40 MiB (server) | 11401 ms, 87 MiB (server) |
| | csme | 9210 ms, 1198 MiB | 12160 ms, 520 MiB | 13267 ms, 972 MiB |
| | wasm-vips-nothreads-demo | 7164 ms, 923 MiB | 9966 ms, 400 MiB | 8227 ms, 581 MiB |
| phone.jpg | core | 2152 ms, 724 MiB | 3810 ms, 25 MiB (server) | 4025 ms, 7 MiB (server) |
| | csme | 3300 ms, 741 MiB | 5211 ms, 359 MiB | 6424 ms, 628 MiB |
| | wasm-vips-nothreads-demo | 2380 ms, 324 MiB | 3687 ms, 270 MiB | 3417 ms, 215 MiB |
| screenshot.png | core | 1848 ms, 723 MiB | 6081 ms, 39 MiB (server) | 7422 ms, 37 MiB (server) |
| | csme | 2867 ms, 745 MiB | 5285 ms, 507 MiB | 5921 ms, 717 MiB |
| | wasm-vips-nothreads-demo | 2082 ms, 309 MiB | 3131 ms, 133 MiB | 2673 ms, 215 MiB |

### WebP output

| Input | Setup | Chromium | Firefox | WebKit |
|---|---|---|---|---|
| 24 MP | core | 8081 ms, 594 MiB | 8892 ms, 30 MiB (server) | 6281 ms, 77 MiB (server) |
| | csme | 11084 ms, 558 MiB | 15421 ms, 301 MiB | 15893 ms, 1003 MiB |
| | wasm-vips-nothreads-demo | 8723 ms, 291 MiB | 11724 ms, 320 MiB | 14260 ms, 499 MiB |
| 50 MP | core | 24195 ms, 1062 MiB | 20676 ms, -9 MiB (server) | 13433 ms, 97 MiB (server) |
| | csme | 37000 ms, 958 MiB | 45976 ms, 613 MiB (1 of 3 on the server) | 45746 ms, 1005 MiB |
| | wasm-vips-nothreads-demo | 26576 ms, 812 MiB | 40886 ms, 289 MiB | 53679 ms, 728 MiB (1 of 3 on the server) |
| phone.jpg | core | 5136 ms, 635 MiB | 6734 ms, 34 MiB (server) | 4950 ms, 34 MiB (server) |
| | csme | 7453 ms, 815 MiB | 10675 ms, 463 MiB | 11000 ms, 794 MiB |
| | wasm-vips-nothreads-demo | 4962 ms, 389 MiB | 10224 ms, 110 MiB | 10458 ms, 260 MiB |
| screenshot.png | core | 3877 ms, 567 MiB | 1979 ms, 26 MiB (server) | 2368 ms, 36 MiB (server) |
| | csme | 5778 ms, 677 MiB | 7671 ms, 519 MiB | 8259 ms, 724 MiB |
| | wasm-vips-nothreads-demo | 3633 ms, 295 MiB | 6915 ms, 292 MiB | 9343 ms, 209 MiB |

### AVIF output

| Input | Setup | Chromium | Firefox | WebKit |
|---|---|---|---|---|
| 24 MP | core | Not compared | 7467 ms, 35 MiB (server) | 7648 ms, 44 MiB (server) |
| | csme | Not compared | Not compared | Not compared |
| | wasm-vips-nothreads-demo | 19175 ms, 189 MiB | 14123 ms, 159 MiB | 12555 ms, 311 MiB |
| phone.jpg | core | Not compared | 5499 ms, 90 MiB (server) | 5600 ms, 31 MiB (server) |
| | csme | Not compared | Not compared | Not compared |
| | wasm-vips-nothreads-demo | 6792 ms, 320 MiB | 8873 ms, 176 MiB | 9041 ms, 436 MiB |
| screenshot.png | core | Not compared | 4121 ms, 51 MiB (server) | 5449 ms, 40 MiB (server) |
| | csme | Not compared | Not compared | Not compared |
| | wasm-vips-nothreads-demo | 6595 ms, 324 MiB | 8092 ms, 224 MiB | 9767 ms, 303 MiB |

> [!NOTE]
> **The release worker and AVIF.** The vips worker in WordPress 7.2 is built on wasm-vips 0.0.19, whose heap can grow to its 2048 MiB maximum while encoding AVIF ([wasm-vips#135](https://github.com/kleisauke/wasm-vips/issues/135), fixed for wasm-vips 0.0.20, which is not released yet). Encoding then fails and the editor keeps the attachment without the failed sizes. With the 24 MP input, the 2048x2048 size and the scaled image were missing in 2 of 3 core runs in Chromium and in all 9 csme runs. The build without threads here carries the same fix, so the release worker's AVIF runs are left out of the table until 0.0.20 can be compared.

> [!NOTE]
> **50 MP with AVIF output.** On WordPress 7.2 RC3, a client-side upload first sends the original to the server, which converts the full-size main image to the output format before the browser makes the other sizes. With the 50 MP input and AVIF, that conversion can pass PHP's 30 second `max_execution_time` before the vips worker runs. The upload then fails with "Could not get a valid response from the server." or finishes on the server. Of the 21 client-side runs, 1 finished in the browser, so 50 MP is not in this table. In core Firefox and WebKit, the server-only path scales the image first and every run finished. Related: [wordpress-develop#16119](https://github.com/WordPress/wordpress-develop/pull/16119) ([Trac #66763](https://core.trac.wordpress.org/ticket/66763)) skips the main file conversion for client-side uploads, and [Gutenberg#87135](https://github.com/WordPress/gutenberg/issues/87135) converts the main file in the browser.

- **The build without threads had the lowest memory rise of the client-side setups in every default and WebP case but two:** the 50 MP input with default output in Chromium (923 MiB against 863 MiB for core) and the 24 MP input as WebP in Firefox (320 MiB against 301 MiB for csme).
- **Times include the server.** With WebP or AVIF output, the server converts the full-size main image before the browser makes the other sizes, so a client-side upload takes longer than the same upload with default output, and longer than the server-only path in Firefox and WebKit. For the processing time alone, see [Benchmarks](benchmarks.md).
- **The release build starts its thread pool with the vips worker.** It started 9 workers for one upload in Chromium and Firefox, where the build without threads started 1. WebKit reports 1 in every setup because Playwright does not list the workers that a worker starts there.

Isolation of the editor page:

| Setup | Chromium | Firefox | WebKit |
|---|---|---|---|
| core | `Document-Isolation-Policy: isolate-and-credentialless` | None | None |
| csme | `Document-Isolation-Policy: isolate-and-credentialless` | COOP `same-origin`, COEP `credentialless` | COOP `same-origin`, COEP `require-corp` |
| wasm-vips-nothreads-demo | None | None | None |

- Apart from the cases in the notes above and below, each attachment has the same 6 sizes and a 2560 px scaled image, all in the output format.
- Every client-side run sent 7 sideload requests, 8 for `phone.jpg`, where the browser also uploads the rotated original. The server-side runs sent none.
- Two WebKit runs with the plugin and WebP output ended without one size: `1536x1536` for the 50 MP input and `large` for the screenshot. In both, the seventh sideload request never reached the server, and `@wordpress/upload-media` finalized the attachment without that size and without a notice ([gutenberg#86456](https://github.com/WordPress/gutenberg/issues/86456)).

## Android phone

An upload by hand in the block editor on an Android phone, with default output and a 6000 × 4000 JPEG of synthetic noise (3.2 MB). It went through an HTTPS tunnel to the test site on 25 November 2026. Time and memory were not measured.

| Setup | Chrome 158 | Samsung Internet 31 | Firefox 160 |
|---|---|---|---|
| core | Not run | Not run | Server |
| csme | Browser | Browser | Server |
| wasm-vips-nothreads-demo | Browser | Browser | Browser |

- Every client-side upload sent 8 sideload requests.
- For the Chrome user agent, core sent `Document-Isolation-Policy` and Client Side Media Everywhere sent no headers, so the csme runs in Chrome and Samsung Internet show what core does there. Client Side Media Everywhere leaves every browser that reports Chrome 137 or later to core, and Samsung Internet 31 reports Chrome 148.
- In Firefox, Client Side Media Everywhere sent `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless`, but the editor page reported `crossOriginIsolated` as false and had no `SharedArrayBuffer`.

## iPhone

An upload by hand in Safari 26.6.3 on an iPhone with iOS 18.7, with default output and the same input, through the same tunnel on 25 November 2026. The client-side uploads sent 7 sideload requests.

| Setup | Safari |
|---|---|
| core | Server |
| csme | Browser |
| wasm-vips-nothreads-demo | Browser |

## Limits

- **The placeholder `SharedArrayBuffer`.** `@wordpress/upload-media` only enables client-side processing when `SharedArrayBuffer` exists, a check made for the threaded build. The placeholder makes that check pass and throws when constructed. Other code on the page that only checks whether `SharedArrayBuffer` exists sees it too. The clean fix is in WordPress: skip the check when the vips build does not need it.
- **Tied to WordPress 7.2.** The worker is a rebuild of the WordPress 7.2 module, and the hooks it removes are internals of WordPress 7.2. A later release may need a plugin update.
- **Core's other checks stay.** WordPress keeps processing on the server when the device reports 2 GB of memory or less, Save-Data is on, or the connection is 2G, and on pages that are not a secure context.