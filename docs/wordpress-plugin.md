# WordPress plugin

[`plugins/wasm-vips-nothreads-demo`](../plugins/wasm-vips-nothreads-demo) makes WordPress 7.2 process uploaded images in the browser in Chromium, Firefox and WebKit, without cross-origin isolation. Every number on this page comes from [`results/wordpress.json`](../results/wordpress.json), written by `npm run wordpress:test`.

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
| 24 MP | core | 4970 ms, 426 MiB | 7741 ms, 5 MiB (server) | 4692 ms, 66 MiB (server) |
| | csme | 4212 ms, 593 MiB | 4599 ms, 568 MiB | 5988 ms, 895 MiB |
| | wasm-vips-nothreads-demo | 3387 ms, 346 MiB | 5158 ms, 286 MiB | 4287 ms, 408 MiB |
| 50 MP | core | 9628 ms, 1011 MiB | 22289 ms, 39 MiB (server) | 9692 ms, 91 MiB (server) |
| | csme | 6969 ms, 1221 MiB | 9022 ms, 584 MiB | 8523 ms, 1042 MiB |
| | wasm-vips-nothreads-demo | 5953 ms, 906 MiB | 7918 ms, 414 MiB | 6899 ms, 627 MiB |
| phone.jpg | core | 4094 ms, 471 MiB | 3415 ms, 22 MiB (server) | 3041 ms, 30 MiB (server) |
| | csme | 2260 ms, 678 MiB | 3587 ms, 548 MiB | 4058 ms, 770 MiB |
| | wasm-vips-nothreads-demo | 2382 ms, 225 MiB | 2932 ms, 282 MiB | 2566 ms, 420 MiB |
| screenshot.png | core | 3294 ms, 608 MiB | 6206 ms, 25 MiB (server) | 5876 ms, 57 MiB (server) |
| | csme | 2277 ms, 512 MiB | 3290 ms, 408 MiB | 3654 ms, 789 MiB |
| | wasm-vips-nothreads-demo | 1903 ms, 287 MiB | 2451 ms, 90 MiB | 2315 ms, 442 MiB |

### WebP output

| Input | Setup | Chromium | Firefox | WebKit |
|---|---|---|---|---|
| 24 MP | core | 6607 ms, 681 MiB | 5166 ms, 29 MiB (server) | 5184 ms, 31 MiB (server) |
| | csme | 8083 ms, 469 MiB | 8327 ms, 462 MiB | 9828 ms, 583 MiB |
| | wasm-vips-nothreads-demo | 6613 ms, 349 MiB | 8231 ms, 288 MiB | 7219 ms, 538 MiB |
| 50 MP | core | 20795 ms, 904 MiB | 12299 ms, 19 MiB (server) | 10357 ms, 85 MiB (server) |
| | csme | 20807 ms, 901 MiB | 23168 ms, 446 MiB | 24815 ms, 1057 MiB |
| | wasm-vips-nothreads-demo | 21275 ms, 840 MiB | 25138 ms, 154 MiB | 22066 ms, 935 MiB |
| phone.jpg | core | 4356 ms, 655 MiB | 4041 ms, 6 MiB (server) | 3800 ms, 47 MiB (server) |
| | csme | 4138 ms, 764 MiB | 6223 ms, 476 MiB | 6017 ms, 852 MiB |
| | wasm-vips-nothreads-demo | 3911 ms, 391 MiB | 5295 ms, 128 MiB | 4793 ms, 545 MiB |
| screenshot.png | core | 3300 ms, 498 MiB | 2004 ms, 35 MiB (server) | 2205 ms, 39 MiB (server) |
| | csme | 3017 ms, 710 MiB | 4330 ms, 568 MiB | 5384 ms, 851 MiB |
| | wasm-vips-nothreads-demo | 2924 ms, 289 MiB | 3679 ms, 31 MiB | 3447 ms, 381 MiB |

### AVIF output

| Input | Setup | Chromium | Firefox | WebKit |
|---|---|---|---|---|
| 24 MP | core | Not compared | 6279 ms, 28 MiB (server) | 6689 ms, 4 MiB (server) |
| | csme | Not compared | Not compared | Not compared |
| | wasm-vips-nothreads-demo | 10638 ms, 574 MiB | 13936 ms, 189 MiB | 12152 ms, 394 MiB |
| phone.jpg | core | Not compared | 4667 ms, 30 MiB (server) | 4916 ms, 40 MiB (server) |
| | csme | Not compared | Not compared | Not compared |
| | wasm-vips-nothreads-demo | 6727 ms, 399 MiB | 8491 ms, 222 MiB | 7889 ms, 374 MiB |
| screenshot.png | core | Not compared | 3307 ms, 53 MiB (server) | 3687 ms, 45 MiB (server) |
| | csme | Not compared | Not compared | Not compared |
| | wasm-vips-nothreads-demo | 6713 ms, 355 MiB | 8228 ms, 119 MiB | 8353 ms, 220 MiB |

> [!NOTE]
> **The release worker and AVIF.** The vips worker in WordPress 7.2 is built on wasm-vips 0.0.19, whose heap can grow to its 2048 MiB maximum while encoding AVIF ([wasm-vips#135](https://github.com/kleisauke/wasm-vips/issues/135), fixed for wasm-vips 0.0.20, which is not released yet). Encoding then fails and the editor keeps the attachment without the failed sizes. With the 24 MP input, the 2048x2048 size and the scaled image were missing in 2 of 3 core runs in Chromium and 6 of 9 csme runs. The build without threads here carries the same fix, so the release worker's AVIF runs are left out of the table until 0.0.20 can be compared. The numbers are in [`results/wordpress.json`](../results/wordpress.json).

> [!NOTE]
> **50 MP with AVIF output.** On WordPress 7.2 RC3, a client-side upload first sends the original to the server, which converts the full-size main image to the output format before the browser makes the other sizes. With the 50 MP input and AVIF, that conversion can pass PHP's 30 second `max_execution_time`, so the request fails and the editor shows "Could not get a valid response from the server." This happens before the vips worker runs. Every csme run failed. With the plugin, 2 of 9 runs failed, 3 finished on the server instead of the browser, and the runs that finished took 32 to 65 seconds. In core Chromium, 2 of 3 runs finished on the server. In core Firefox and WebKit, the server-only path scales the image first and every run finished in 11 to 13 seconds. Related: [wordpress-develop#16119](https://github.com/WordPress/wordpress-develop/pull/16119) ([Trac #66763](https://core.trac.wordpress.org/ticket/66763)) skips the main file conversion for client-side uploads, and [Gutenberg#87135](https://github.com/WordPress/gutenberg/issues/87135) converts the main file in the browser.

- **The build without threads had the lowest memory rise of the client-side setups in every default and WebP case.** For example, 346 MiB against 426 and 593 MiB in Chromium with the 24 MP input, and 31 MiB against 568 MiB in Firefox with the screenshot as WebP. The rise covers the whole browser and varies between runs.
- **Times include the server.** With WebP or AVIF output, the server converts the full-size main image before the browser makes the other sizes, so a client-side upload takes longer than the same upload with default output, and longer than the server-only path in Firefox and WebKit. For the processing time alone, see [Benchmarks](benchmarks.md).
- **The release build starts its thread pool with the vips worker.** It started 9 workers for one upload in Chromium and Firefox, where the build without threads started 1. WebKit reports 1 in every setup because Playwright does not list the workers that a worker starts there.

Isolation of the editor page:

| Setup | Chromium | Firefox | WebKit |
|---|---|---|---|
| core | `Document-Isolation-Policy: isolate-and-credentialless` | None | None |
| csme | `Document-Isolation-Policy: isolate-and-credentialless` | COOP `same-origin`, COEP `credentialless` | COOP `same-origin`, COEP `require-corp` |
| wasm-vips-nothreads-demo | None | None | None |

- Apart from the cases in the notes above, each attachment has the same 6 sizes and a 2560 px scaled image, all in the output format.
- Every client-side run sent 7 sideload requests, 8 for `phone.jpg`, where the browser also uploads the rotated original. The server-side runs sent none.
- With the plugin, no page was cross-origin isolated in any browser.
- One WebKit run with the plugin, `phone.jpg` with AVIF output, ended with `phone-rotated-1.jpg` as the main file and `phone-62.avif` as the original image. This was not investigated.

## Android phone

An upload by hand in the block editor on an Android phone, with default output and the earlier 24 MP input, a 6000 × 4000 JPEG of synthetic noise (3.2 MB). It went through an HTTPS tunnel to the test site on 25 November 2026. A run counts as client-side when the server log shows sideload requests for it. Time and memory were not measured, so these runs have no file in `results/`.

| Setup | Chrome 158 | Samsung Internet 31 | Firefox 160 |
|---|---|---|---|
| core | Not run | Not run | Server |
| csme | Browser | Browser | Server, twice |
| wasm-vips-nothreads-demo | Browser | Browser | Browser |

- Every client-side upload sent 8 sideload requests.
- For the Chrome user agent, core sent `Document-Isolation-Policy` and Client Side Media Everywhere sent no headers, so the csme runs in Chrome and Samsung Internet show what core does there. Client Side Media Everywhere leaves every browser that reports Chrome 137 or later to core, and Samsung Internet 31 reports Chrome 148.
- In Firefox, Client Side Media Everywhere sent `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless`, but the editor page reported `crossOriginIsolated` as false and had no `SharedArrayBuffer`, read through Firefox remote debugging.

## iPhone

An upload by hand in Safari 26.6.3 on an iPhone with iOS 18.7, with default output and the same earlier input. It went through an HTTPS tunnel to the test site on 25 November 2026. A run counts as client-side when the server log shows sideload requests for it. Every browser on iOS uses WebKit, as Safari does.

| Setup | Safari |
|---|---|
| core | Server |
| csme | Browser |
| wasm-vips-nothreads-demo | Browser |

- Every client-side upload sent 7 sideload requests.

## Limits

- **The placeholder `SharedArrayBuffer`.** `@wordpress/upload-media` only enables client-side processing when `SharedArrayBuffer` exists, a check made for the threaded build. The placeholder makes that check pass and throws when constructed. Other code on the page that only checks whether `SharedArrayBuffer` exists sees it too. The clean fix is in WordPress: skip the check when the vips build does not need it.
- **Tied to WordPress 7.2.** The worker is a rebuild of the WordPress 7.2 module, and the hooks it removes are internals of WordPress 7.2. A later release may need a plugin update.
- **Core's other checks stay.** WordPress keeps processing on the server when the device reports 2 GB of memory or less, Save-Data is on, or the connection is 2G, and on pages that are not a secure context.