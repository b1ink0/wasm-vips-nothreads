# wasm-vips unit tests

The unit tests that ship with wasm-vips (`test/unit`), run with the build without threads in Node, Chromium, Firefox and WebKit. Every number on this page comes from [`results/wasm-vips-test.json`](../results/wasm-vips-test.json), written by `npm run wasm-vips:test`.

## The runs

wasm-vips 0.0.19, [`49ac437`](https://github.com/kleisauke/wasm-vips/commit/49ac4378f2df80e38f45491abeeac9b86dddbedd), built without threads. 238 tests in 15 files.

| Environment | How | mocha |
|---|---|---|
| Node v24.22.1 | The `test` script of `test/unit/package.json`, as the wasm-vips CI runs it | 12.0.3 |
| Chromium 156.0.8078.4 | `test/unit/index.html`, served without cross-origin isolation headers, through Playwright | 12.0.2 |
| Firefox 157.0 | Same | 12.0.2 |
| WebKit 27.2 | Same | 12.0.2 |

- In the browsers, the tests run on the main thread of the page, as `index.html` loads them. The script stops if the page is cross-origin isolated.
- Each run stops after 20 minutes and is recorded as hung.
- The tests, `node-helper.js` and `index.html` are not changed. They load the JPEG XL, HEIF and SVG modules, which the build has.

## Results

| Environment | Passed | Skipped | Failed | Hung |
|---|---|---|---|---|
| Node | 235 | 3 | 0 | No |
| Chromium | 235 | 3 | 0 | No |
| Firefox | 235 | 3 | 0 | No |
| WebKit | 235 | 3 | 0 | No |

The same tests pass and skip in all four. Per file:

| File | Passed | Skipped | Failed |
|---|---|---|---|
| `test_arithmetic.js` | 63 | 0 | 0 |
| `test_auto_delete.js` | 3 | 0 | 0 |
| `test_block.js` | 2 | 0 | 0 |
| `test_colour.js` | 6 | 0 | 0 |
| `test_connection.js` | 14 | 0 | 0 |
| `test_conversion.js` | 40 | 0 | 0 |
| `test_convolution.js` | 7 | 1 | 0 |
| `test_create.js` | 26 | 2 | 0 |
| `test_draw.js` | 7 | 0 | 0 |
| `test_foreign.js` | 30 | 0 | 0 |
| `test_histogram.js` | 12 | 0 | 0 |
| `test_iofuncs.js` | 5 | 0 | 0 |
| `test_morphology.js` | 5 | 0 | 0 |
| `test_mosaicing.js` | 6 | 0 | 0 |
| `test_resample.js` | 9 | 0 | 0 |

The skipped tests skip themselves, whatever the build:

| Test | Why it skips |
|---|---|
| `convolution conva` | Skipped in the test source ("it's still not done"). |
| `create fractsurf` | Needs FFTW, which wasm-vips does not include. |
| `create text` | Needs text support, which wasm-vips does not include. |

## Bugs found by the tests

The first runs of these tests found two bugs in the build without threads. Both are fixed by patches described in [How it works](how-it-works.md#what-the-build-without-threads-changes):

- Tests that pass number arrays to wasm failed with "detached ArrayBuffer" after the memory first grew. Fixed by `emscripten-vector-heap.patch`.
- `colour colourspace` and `foreign heifload` ran out of memory, as the calling thread did not get the buffer cache libvips gives its own threads. Fixed in `libvips-nothreads.patch`.

## What the tests cover

- Most libvips operations through the wasm-vips API: arithmetic, colour, conversion, convolution, creation, drawing, histograms, morphology, mosaicing and resampling.
- Loading and saving JPEG, PNG, WebP, GIF, TIFF, AVIF and HEIF, JPEG XL and UltraHDR, from files, buffers and the source and target API, and loading SVG.
- `thumbnail` and `autorot`.
- Saving to files, buffers and targets. The JPEG, PNG, WebP, GIF, TIFF, HEIF and JPEG XL savers write through `vips_sink_disc()`, the function whose background writer the build replaces.
- Freeing images, with and without `preventAutoDelete`.

## What the tests do not cover

- **Web Workers.** In the browsers, the tests run on the main thread of the page with one wasm-vips instance. Running one instance per Web Worker, as the benchmarks and the WordPress plugin do, is not tested here. Those setups are in [Benchmarks](benchmarks.md) and the [Gutenberg e2e tests](gutenberg-e2e.md).
- **Phones.** The browsers are the desktop builds Playwright installs.
- **Speed and memory.** The tests check results, not time or heap size.
- **Operations the tests do not call.** None of them calls `dzsave`, `tilecache` or `linecache` directly.
- **Features wasm-vips does not include.** Text and FFTW, listed above.

Passing these tests means the build gives the same results as wasm-vips expects for what the tests check. It does not show that every libvips path works without threads.

## Run it yourself

```sh
npm run setup
npm run build nothreads
npm run wasm-vips:test
```

The script installs the test dependencies in `src/nothreads/test/unit` on the first run. The page loads mocha and chai from cdnjs, as upstream's does, so the browser runs need network access.
