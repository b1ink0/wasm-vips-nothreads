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

`npm run wordpress` starts WordPress 7.2 RC3 in Docker at http://localhost:8889 with the plugin mounted. `npm run wordpress:test` then activates only the plugins of each setup and, in each browser, uploads each input 3 times, each time in a fresh browser:

1. Logs in, opens a new post and inserts an image block.
2. Uploads the input to the block: `images/input.jpg` (24 MP, 3.2 MB) or `images/input-8660x5773.jpg` (50 MP, 6.8 MB).
3. Waits until the block has its attachment and the upload queue is empty, or until the editor shows an error notice.
4. Reads the attachment metadata through WP-CLI.

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

Every run passed. Each cell is the median of 3 runs, 24 MP / 50 MP. In core, Firefox and WebKit process the image on the server. Every other run processes it in the browser.

Time from choosing the file to the end of the upload:

| Setup | Chromium | Firefox | WebKit |
|---|---|---|---|
| core | 2176 / 2556 ms | 3179 / 7186 ms (server) | 3165 / 7123 ms (server) |
| csme | 2148 / 2792 ms | 2556 / 3158 ms | 3692 / 3751 ms |
| wasm-vips-nothreads-demo | 1748 / 2606 ms | 2427 / 3769 ms | 2847 / 3087 ms |

Rise in browser memory during the upload:

| Setup | Chromium | Firefox | WebKit |
|---|---|---|---|
| core | 542 / 1043 MiB | 28 / 28 MiB (server) | 47 / 59 MiB (server) |
| csme | 676 / 1037 MiB | 363 / 539 MiB | 571 / 1004 MiB |
| wasm-vips-nothreads-demo | 298 / 923 MiB | 215 / 303 MiB | 437 / 446 MiB |

- **The build without threads used less memory than the release build, or about the same.** With the 24 MP input it used about half as much in Chromium, and less in Firefox and WebKit. With the 50 MP input it used less than half in WebKit and less in Firefox. In Chromium with the 50 MP input, the difference is within the spread between runs. For example, core and csme run the same build in Chromium and differ by 134 MiB with the 24 MP input.
- **The release build starts its thread pool with the vips worker.** It started 9 workers for one upload in Chromium and Firefox, where the build without threads started 1. WebKit reports 1 in every setup because Playwright does not list the workers that a worker starts there.
- **The times include the requests to WordPress and vary between runs.** For the processing time alone, see [Benchmarks](benchmarks.md).

Isolation of the editor page:

| Setup | Chromium | Firefox | WebKit |
|---|---|---|---|
| core | `Document-Isolation-Policy: isolate-and-credentialless` | None | None |
| csme | `Document-Isolation-Policy: isolate-and-credentialless` | COOP `same-origin`, COEP `credentialless` | COOP `same-origin`, COEP `require-corp` |
| wasm-vips-nothreads-demo | None | None | None |

- Each attachment has the same 6 sizes and a 2560 px scaled image, with the upload kept as the original image.
- Every client-side run sent 7 sideload requests. The server-side runs sent none.
- With the plugin, no page was cross-origin isolated in any browser.

## Android phone

The same upload by hand in the block editor on an Android phone, through an HTTPS tunnel to the test site, on 25 November 2026. A run counts as client-side when the server log shows sideload requests for it. Time and memory were not measured, so these runs have no file in `results/`.

| Setup | Chrome 158 | Samsung Internet 31 | Firefox 160 |
|---|---|---|---|
| core | Not run | Not run | Server |
| csme | Browser | Browser | Server, twice |
| wasm-vips-nothreads-demo | Browser | Browser | Browser |

- Every client-side upload sent 8 sideload requests.
- For the Chrome user agent, core sent `Document-Isolation-Policy` and Client Side Media Everywhere sent no headers, so the csme runs in Chrome and Samsung Internet show what core does there. Client Side Media Everywhere leaves every browser that reports Chrome 137 or later to core, and Samsung Internet 31 reports Chrome 148.
- In Firefox, Client Side Media Everywhere sent `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless`, but the editor page reported `crossOriginIsolated` as false and had no `SharedArrayBuffer`, read through Firefox remote debugging.

## iPhone

The same upload by hand in Safari 26.6.3 on an iPhone with iOS 18.7, through an HTTPS tunnel to the test site, on 25 November 2026. A run counts as client-side when the server log shows sideload requests for it. Every browser on iOS uses WebKit, as Safari does.

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