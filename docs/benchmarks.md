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

- **Encoding:** the same options as `@wordpress/vips` in WordPress 7.2: JPEG quality 82, WebP quality 86, AVIF quality 82 with effort 2, ICC profiles kept. Most runs encode JPEG and WebP. The AVIF runs add AVIF.
- **Inputs:** two camera photos from Wikimedia Commons, downloaded and checked by `npm run images`: `images/input.jpg` (6016 × 4000, 24 MP, 13 MB) and `images/input-8685x5789.jpg` (8685 × 5789, 50 MP, 33 MB). Both are sRGB JPEGs with an ICC profile and EXIF. Credits are in the [README](../README.md#test-photos).
- **Timing:** one warm-up batch, then 5 timed batches (3 for the 50 MP input). The tables show the median. Start-up time is measured separately.
- **Workers:** with more than one worker, the tasks are spread round-robin over that many workers, each with its own wasm-vips instance. WordPress uses one worker.
- **Heap:** the size of each instance's WebAssembly memory after the run, which starts at 256 MiB and grows as needed.
- **Machine:** Apple M3 (8 cores), macOS 15.8.2, Node 24.22.1, Playwright 1.64.0 with Chromium 156, Firefox 157 and WebKit (Safari 27.2).

The builds:

| Name | What it is |
|---|---|
| baseline | The wasm-vips 0.0.19 release built from source here, with threads and the heap fix described in [How it works](how-it-works.md#what-the-build-without-threads-changes) |
| nothreads | The same commit built without threads |

In the browser tables, baseline runs on a cross-origin isolated page and nothreads on a plain page. Browsers run both builds with libvips concurrency 1, as the release build does on the web, except in [More threads per image](#browsers-more-threads-per-image).

## Browsers, one worker

This is the case WordPress runs. The difference compares nothreads with baseline.

### 24 MP, JPEG and WebP

| Browser | baseline | nothreads | Difference |
|---|---|---|---|
| Chromium | 3405 ms | 2889 ms | -15% |
| Firefox | 3474 ms | 3237 ms | -7% |
| WebKit | 2979 ms | 3067 ms | +3% |

### 24 MP, JPEG, WebP and AVIF

| Browser | baseline | nothreads | Difference |
|---|---|---|---|
| Chromium | 7526 ms | 7264 ms | -3% |
| Firefox | 8548 ms | 8041 ms | -6% |
| WebKit | 7249 ms | 8343 ms | +15% |

In WebKit every baseline batch was faster than every nothreads batch.

With the 24 MP input, the heap after the run is 531 MiB for baseline and 369 MiB for nothreads in every browser.

### 50 MP, JPEG and WebP

| Browser | baseline | nothreads | Difference |
|---|---|---|---|
| Chromium | 5585 ms | 4977 ms | -11% |
| Firefox | 5842 ms | 5677 ms | -3% |
| WebKit | 5194 ms | 5258 ms | +1% |

Heap after the run: baseline 764 MiB in Chromium and 909 MiB in Firefox and WebKit, nothreads 531 MiB.

Start-up of one instance, 24 MP runs: Chromium 78 ms (baseline) and 40 ms (nothreads), Firefox 267 ms and 125 ms, WebKit 143 ms and 122 ms.

## Browsers, four workers

| Input | Browser | baseline | nothreads |
|---|---|---|---|
| 24 MP, JPEG and WebP | Chromium | 1782 ms | 1138 ms |
| | Firefox | 1426 ms | 1280 ms |
| | WebKit | 1257 ms | 1211 ms |
| 24 MP, with AVIF | Chromium | 4495 ms | 3317 ms |
| | Firefox | 6660 ms | 3867 ms |
| | WebKit | 4063 ms | 4622 ms |
| 50 MP, JPEG and WebP | Chromium | 2705 ms | 1972 ms |
| | Firefox | 2332 ms | 2240 ms |
| | WebKit | 2077 ms | 2312 ms |

Four workers hold four heaps, 307 to 764 MiB each in these runs.

## Browsers, more threads per image

The release build on the isolated page, one worker, 24 MP JPEG and WebP, with libvips concurrency set by `vips.concurrency()` after start-up. The c1 column is the baseline column of the one-worker table, from a separate run, so differences of a few percent are within noise.

| Browser | c1 | c4 | c8 |
|---|---|---|---|
| Chromium | 3405 ms | 2853 ms | 2883 ms |
| Firefox | 3474 ms | 3187 ms | 3651 ms |
| WebKit | 2979 ms | 2859 ms | 2881 ms |

- The heap is 531 MiB at every concurrency.
- Concurrency 4 is 4 to 16% faster than concurrency 1.
- Concurrency 8 is no faster than 4: within 1% in Chromium and WebKit, and 15% slower in Firefox.
- nothreads with four workers (the four-worker table) is 2.4 to 2.5 times faster than baseline with one worker at concurrency 4.
- nothreads ignores the setting. Its one-worker times in the same runs stay within 3% of the one-worker table, except one WebKit run at 3672 ms.

## Phones

The [published pages](https://b1ink0.github.io/wasm-vips-nothreads/), opened once per setup on a Samsung Galaxy S26 Ultra and an iPhone 17 Pro on 25 November 2026. These runs used a 6000 × 4000 JPEG of synthetic noise (3.2 MB) and AVIF quality 52, so they cannot be compared with the tables above.

Each cell is the median of 5 batches, read from screenshots of the pages. Every browser on iOS uses WebKit.

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
- On the Galaxy, the build without threads was faster than the release build in Chrome and Firefox. Its Samsung Internet result varied too much between batches to compare.
- With four workers and AVIF, the heaps added up to 1137 MiB for the build without threads and 1323 MiB for the release build on both phones.

## Release build without isolation

On the plain page, the baseline build fails in every browser:

- Chromium and Firefox: start-up does not finish within 60 seconds.
- WebKit: start-up finishes, then the first image throws a `WebAssembly.Exception` (a C++ exception from inside the module).

## Node

Node needs no isolation, so it compares the builds with libvips' own thread pool too. "c8" is the default concurrency on this machine, "c1" is concurrency 1 as on the web.

| Run | 24 MP, JPEG and WebP | 24 MP, with AVIF | 50 MP, JPEG and WebP |
|---|---|---|---|
| baseline, c8 | 3127 ms | 8008 ms | 6032 ms |
| baseline, c1 | 3169 ms | 8134 ms | 5849 ms |
| nothreads | 3185 ms | 9258 ms | 5608 ms |
| baseline, c1, 4 workers | 1194 ms | 3968 ms | 2996 ms |
| nothreads, 4 workers | 1260 ms | 4992 ms | 2586 ms |

In the AVIF run, the nothreads batches varied widely, so its median is not a steady number.

One 2048 px JPEG from the 50 MP input, the case a thread pool helps most: 552 ms (baseline, c8) and 530 ms (nothreads).

## Output

Every JPEG and WebP output has the same SHA-256 in every run: both builds, Node and all three browsers. AVIF outputs are identical in every run with concurrency 1, which covers every browser run. Only the Node run with concurrency 8 produces different AVIF bytes.
