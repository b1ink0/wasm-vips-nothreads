# Benchmarks

Every number on this page comes from a JSON file in [`results/`](../results), written by `npm run bench`, except the [Phones](#phones) table.

## Method

Each run does what WordPress does for one uploaded image: it makes every default image size from the original and encodes each one.

| Size | Box | Crop |
|---|---|---|
| thumbnail | 150 × 150 | yes |
| medium | 300 × 300 | no |
| medium_large | 768 wide | no |
| large | 1024 × 1024 | no |
| 1536x1536 | 1536 × 1536 | no |
| 2048x2048 | 2048 × 2048 | no |

- **Encoding:** the same options as `@wordpress/vips` in WordPress 7.2: JPEG quality 82, WebP quality 86, AVIF quality 82 with effort 2, ICC profiles kept. Most runs encode JPEG and WebP (12 outputs). The AVIF runs add AVIF (18 outputs).
- **Inputs:** two camera photos from Wikimedia Commons, downloaded and checked by `npm run images`: `images/input.jpg` (6016 × 4000, 24 MP, 13 MB) and `images/input-8685x5789.jpg` (50 MP, 33 MB). Both are sRGB JPEGs with an ICC profile and EXIF. Credits are in the [README](../README.md#test-photos).
- **Timing:** one warm-up batch, then 5 timed batches (3 for the 50 MP input). The tables show the median. Start-up time is measured separately.
- **Workers:** with more than one worker, the tasks are spread round-robin over that many workers, each with its own wasm-vips instance. WordPress uses one worker.
- **Heap:** the size of each instance's WebAssembly memory after the run, which starts at 256 MiB and grows as needed.
- **Machine:** Apple M3 (8 cores), macOS 15.8.2, Node 24.22.1, Playwright 1.64.0 with Chromium 156, Firefox 157 and WebKit (Safari 27.2).

The builds:

| Name | What it is |
|---|---|
| baseline | The wasm-vips 0.0.19 release built from source here, with threads and the heap fix described in [How it works](how-it-works.md#what-the-build-without-threads-changes) |
| nothreads | The same commit built without threads |

In the browser tables, baseline runs on a cross-origin isolated page, since it needs it. nothreads runs on a plain page without isolation. Browsers run both builds with libvips concurrency 1, which the release build sets on the web, except in [More threads per image](#browsers-more-threads-per-image).

## Browsers, one worker

This is the case WordPress runs. The difference compares nothreads with baseline.

### 24 MP, JPEG and WebP

| Browser | baseline | nothreads | Difference | Heap (baseline, nothreads) |
|---|---|---|---|---|
| Chromium | 2961 ms | 3017 ms | +2% | 531, 307.25 MiB |
| Firefox | 3360 ms | 3301 ms | -2% | 531, 307.25 MiB |
| WebKit | 2936 ms | 3065 ms | +4% | 531, 307.25 MiB |

### 24 MP, JPEG, WebP and AVIF

| Browser | baseline | nothreads | Difference | Heap (baseline, nothreads) |
|---|---|---|---|---|
| Chromium | 7412 ms | 7210 ms | -3% | 531, 307.25 MiB |
| Firefox | 8683 ms | 8483 ms | -2% | 531, 307.25 MiB |
| WebKit | 7305 ms | 8255 ms | +13% | 531, 307.25 MiB |

In WebKit the nothreads batches spread from 7590 to 10236 ms, the baseline batches from 7235 to 7477 ms.

### 50 MP, JPEG and WebP

| Browser | baseline | nothreads | Difference | Heap (baseline, nothreads) |
|---|---|---|---|---|
| Chromium | 5427 ms | 5033 ms | -7% | 908.94, 442.5 MiB |
| Firefox | 5819 ms | 5669 ms | -3% | 908.94, 442.5 MiB |
| WebKit | 5233 ms | 5239 ms | 0% | 908.94, 442.5 MiB |

Start-up of one instance, 24 MP runs: Chromium 75 ms (baseline) and 60 ms (nothreads), Firefox 216 ms and 193 ms, WebKit 67 ms and 39 ms.

## Browsers, four workers

| Input | Browser | baseline | nothreads |
|---|---|---|---|
| 24 MP, JPEG and WebP | Chromium | 1499 ms | 1145 ms |
| | Firefox | 1532 ms | 1274 ms |
| | WebKit | 1169 ms | 1208 ms |
| 24 MP, with AVIF | Chromium | 3417 ms | 3333 ms |
| | Firefox | 3964 ms | 4132 ms |
| | WebKit | 4628 ms | 3996 ms |
| 50 MP, JPEG and WebP | Chromium | 2210 ms | 1900 ms |
| | Firefox | 2290 ms | 2113 ms |
| | WebKit | 1875 ms | 1958 ms |

Four workers hold four heaps, 256 to 764 MiB each in these runs.

## Browsers, more threads per image

The release build on the isolated page, one worker, 24 MP JPEG and WebP, with libvips concurrency set by `vips.concurrency()` after start-up. The c1 column is the baseline column of the one-worker table, from a separate run, so differences of a few percent are within noise.

| Browser | c1 | c4 | c8 | Heap (c1, c4, c8) |
|---|---|---|---|---|
| Chromium | 2961 ms | 2832 ms | 2849 ms | 531, 531, 531 MiB |
| Firefox | 3360 ms | 3230 ms | 3220 ms | 531, 531, 531 MiB |
| WebKit | 2936 ms | 2875 ms | 2868 ms | 531, 531, 531 MiB |

- Every run finished, and the workers reported the concurrency that was set.
- Concurrency 4 is 2 to 4% faster than concurrency 1.
- Concurrency 8 is no faster than 4: within 1% in every browser.
- nothreads with four workers (the four-worker table) is 2.4 to 2.5 times faster than baseline with one worker at concurrency 4.
- nothreads ignores the setting. Its one-worker times in the same runs stay within 2% of the one-worker table.
- The outputs are byte-identical at every concurrency.

## Phones

The [published pages](https://b1ink0.github.io/wasm-vips-nothreads/), opened once per setup on a Samsung Galaxy S26 Ultra and an iPhone 17 Pro on 25 November 2026. These runs used the earlier 24 MP input, a 6000 × 4000 JPEG of synthetic noise (3.2 MB), and AVIF quality 52, so they cannot be compared with the tables above. They have not been run again with the camera photo.

Each cell is the median of 5 batches. The numbers were read from screenshots of the pages, so there is no file in `results/` for them, and the browser versions were not recorded. Every browser on iOS uses WebKit.

| Phone | Browser | nothreads, 1 worker, plain page | baseline, 1 worker, isolated page | nothreads, 4 workers with AVIF, plain page | baseline, 4 workers with AVIF, isolated page |
|---|---|---|---|---|---|
| Galaxy S26 Ultra | Chrome | 2272 ms | 2454 ms | 2008 ms | 2751 ms |
| | Firefox | 2283 ms | 3268 ms | 2260 ms | 2607 ms |
| | Samsung Internet | 4083 ms | 2903 ms | 2147 ms | Not run |
| iPhone 17 Pro | Safari | 1598 ms | 1591 ms | 1599 ms | 1608 ms |
| | Chrome | 1616 ms | 1614 ms | 1660 ms | 1600 ms |
| | Firefox | 1641 ms | 1599 ms | 1702 ms | 1668 ms |

- Every run finished. On the plain page every browser reported `crossOriginIsolated` and `SharedArrayBuffer` as false, and the build without threads still ran.
- On the iPhone, the two builds are within 3% of each other in every browser.
- On the Galaxy, the build without threads was faster than the release build in Chrome and Firefox. The 4083 ms run in Samsung Internet spread from 2511 to 4569 ms, so it is not a steady number.
- With four workers and AVIF, the heaps added up to 1136.75 MiB for the build without threads and 1323.25 MiB for the release build on both phones.
- For the first output, `1536x1536.jpeg`, the part of the SHA-256 visible in the screenshots is the same in both builds in Chrome and Firefox on the Galaxy, and matched the desktop output of that input.
- The release build on the plain page was not run on the phones.

## Release build without isolation

On the plain page, the baseline build fails in every browser:

- Chromium and Firefox: start-up does not finish within 60 seconds.
- WebKit: start-up finishes, then the first image throws a `WebAssembly.Exception` (a C++ exception from inside the module).

## Node

Node needs no isolation, so it compares the builds with libvips' own thread pool too. "c8" is the default concurrency on this machine, "c1" is concurrency 1 as on the web.

| Run | 24 MP, JPEG and WebP | 24 MP, with AVIF | 50 MP, JPEG and WebP |
|---|---|---|---|
| baseline, c8 | 3069 ms | 7621 ms | 6278 ms |
| baseline, c1 | 3118 ms | 7793 ms | 5732 ms |
| nothreads | 3210 ms | 8069 ms | 5454 ms |
| baseline, c1, 4 workers | 1174 ms | 3527 ms | 2834 ms |
| nothreads, 4 workers | 1302 ms | 4167 ms | 2743 ms |

nothreads with 2 and 6 workers on the 24 MP JPEG and WebP run: 1950 ms and 1159 ms.

One 2048 px JPEG from the 50 MP input, the case a thread pool helps most: 471 ms (baseline, c8) and 506 ms (nothreads).

## Output

Every JPEG and WebP output has the same SHA-256 in every run: both builds, Node and all three browsers. AVIF outputs are identical in every run with concurrency 1, which covers every browser run. Only the Node run with concurrency 8 produces different AVIF bytes.
