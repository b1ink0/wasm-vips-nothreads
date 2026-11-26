# Gutenberg e2e tests

The media e2e tests of Gutenberg, run in Chromium, Firefox and WebKit with two builds of wasm-vips. Every number on this page comes from [`results/gutenberg-e2e.json`](../results/gutenberg-e2e.json), written by `npm run gutenberg:test`.

## The two runs

| | Release build | Build without threads |
|---|---|---|
| wasm-vips | The 0.0.19 release built from source here, with threads and the heap fix described in [How it works](how-it-works.md#what-the-build-without-threads-changes) | The same commit built without threads |
| Editor isolation | `Document-Isolation-Policy`, as Gutenberg sends it | Off |
| `SharedArrayBuffer` check in `@wordpress/upload-media` | Kept | Removed |
| Gutenberg | trunk at [`d15f04a`](https://github.com/WordPress/gutenberg/commit/d15f04a87173302fb9107e8e663abdef5de47398) | Same |
| WordPress | 7.3-alpha-65788, [`32845e4`](https://github.com/WordPress/WordPress/commit/32845e40595e4c684dd1047903e182141f539224) | Same |

The changes for the second run are in [`patches/gutenberg-nothreads.patch`](../patches/gutenberg-nothreads.patch).

Specs, all in `test/e2e/specs/editor/`:

- `various/client-side-media-processing`
- `various/animated-image-subsizes`
- `various/gif-to-video`
- `various/heic-*`
- `various/big-image-size-threshold`
- `various/upload-progress-snackbar`
- `various/upload-save-lock`
- `blocks/image`, `blocks/gallery` and `blocks/cover`
- `various/client-side-media-nothreads-extra`, added here (see [Tests added](#tests-added))

## Results

| Browser | Release build | Build without threads |
|---|---|---|
| Chromium | 101 passed, 2 failed, 1 skipped | 102 passed, 1 failed, 1 skipped |
| Firefox | 67 passed, 2 failed, 35 skipped | 98 passed, 5 failed, 1 skipped |
| WebKit | 63 passed, 6 failed, 35 skipped | 97 passed, 6 failed, 1 skipped |

- The tests skipped with the release build need client-side processing. Firefox and WebKit can't isolate the editor, so client-side processing is off there and the tests skip themselves.
- Without threads, client-side processing runs in all three browsers, so those tests run.
- Every failure is listed in [Failures](#failures).

## Image types and cases

✅ passed, ⏭️ skipped, ❌ failed. C, F and W are Chromium, Firefox and WebKit.

| Case | Test | Release build (C, F, W) | Without threads (C, F, W) |
|---|---|---|---|
| Animated GIF | keeps the animation in every sub-size of an animated GIF | ✅ ⏭️ ⏭️ | ✅ ✅ ✅ |
| Animated WebP | keeps the animation in every sub-size of an animated WebP | ✅ ⏭️ ⏭️ | ✅ ✅ ✅ |
| Animated GIF | generates static first-frame sub-sizes of an animated GIF | ✅ ⏭️ ⏭️ | ✅ ✅ ✅ |
| Animated WebP | generates static first-frame sub-sizes of an animated WebP | ✅ ⏭️ ⏭️ | ✅ ✅ ✅ |
| Animated GIF | preserves an animated GIF | ✅ ⏭️ ⏭️ | ✅ ✅ ✅ |
| GIF to video | keeps the uploaded GIF as an Image block and offers a Video transform | ✅ ⏭️ ⏭️ | ✅ ✅ ✅ |
| GIF to video | completes the upload of a long animated GIF | ✅ ⏭️ ⏭️ | ✅ ✅ ✅ |
| Palette PNG | keeps sub-sizes of an indexed PNG indexed | ✅ ⏭️ ⏭️ | ✅ ✅ ✅ |
| UltraHDR | preserves UltraHDR gain map through sub-size resize | ✅ ⏭️ ⏭️ | ✅ ✅ ✅ |
| AVIF | decodes and uploads an AVIF image as AVIF | ✅ ⏭️ ⏭️ | ✅ ✅ ✅ |
| AVIF | rotates AVIF sub-sizes from EXIF-only orientation | ✅ ⏭️ ⏭️ | ✅ ✅ ✅ |
| 10-bit AVIF | decodes a 10-bit AVIF and generates its sub-sizes (added) | ✅ ⏭️ ⏭️ | ✅ ✅ ✅ |
| 12-bit AVIF | decodes a 12-bit AVIF and generates its sub-sizes (added) | ✅ ⏭️ ⏭️ | ✅ ✅ ✅ |
| Cancel | cancels an upload while vips is processing it (added) | ✅ ⏭️ ⏭️ | ✅ ✅ ✅ |
| Worker crash | recovers when the image processing worker crashes mid-upload | ✅ ⏭️ ⏭️ | ✅ ✅ ✅ |

## Tests added

Gutenberg has no tests for high bit depth AVIF or for cancelling. They are added in [`client-side-media-nothreads-extra.spec.js`](../patches/gutenberg-e2e.patch#L81), part of `patches/gutenberg-e2e.patch`, and run with both builds.

**10-bit and 12-bit AVIF**

- The script makes the two test images from `images/input.jpg` with the Node build of wasm-vips: 1024 × 683, 16-bit RGB, saved as AVIF with 10 and 12 bits.
- The test uploads each image and checks the size and type of the upload and the size of the `thumbnail`, `medium` and `medium_large` files.
- It also reads each generated file with wasm-vips and records its bit depth. It records it but does not check it.

| Image | Recorded bit depth of the sizes, without threads (C, F, W) |
|---|---|
| 10-bit AVIF | 10, 10, 10 |
| 12-bit AVIF | 12, 12, 12 |

**Cancel while vips is processing**

1. Uploads Gutenberg's 5000 × 4000 test JPEG.
2. Waits until the vips worker has started, waits 300 ms more, then cancels the upload.
3. Records how long the upload queue takes to empty.
4. Checks that the post can be saved again.
5. Uploads another image and checks that it finishes.

| | Chromium | Firefox | WebKit |
|---|---|---|---|
| Queue empty after cancel, release build | 15 ms | Skipped | Skipped |
| Queue empty after cancel, without threads | 937 ms | 8 ms | 70 ms |

## Changes to existing tests

These are in [`patches/gutenberg-e2e.patch`](../patches/gutenberg-e2e.patch) and apply to both runs.

| Test | Change | Why |
|---|---|---|
| [`big-image-size-threshold.spec.js`](../patches/gutenberg-e2e.patch#L1) (3 tests) | Checks `isClientSideMediaSupported()` instead of `window.crossOriginIsolated` | The tests want to know whether client-side processing is on. Without threads it is on, although the page is not isolated. |
| [`gif-to-video.spec.js`](../patches/gutenberg-e2e.patch#L50) | Same | Same |
| [`client-side-media-processing.spec.js`](../patches/gutenberg-e2e.patch#L32), worker crash test | Dispatches the `ErrorEvent` on the worker before terminating it, not after | WebKit does not deliver an event dispatched on a terminated worker. Chromium and Firefox do. |

## Failures

| Test | Failed in | Release build | Why |
|---|---|---|---|
| Image: can be replaced by dragging-and-dropping images from the inserter | Firefox | Fails too | Not related to wasm-vips |
| Image: should keep the overlay intact when reopened before the close cleanup runs | Chromium | Fails too | Not related to wasm-vips |
| Image: should have keyboard navigable toolbar for caption | Firefox, WebKit | Fails too in WebKit, passed in Firefox | Fails in WebKit with both builds. In Firefox it passed 2 of 3 reruns, so it is flaky there. |
| HEIC upload error message (2 tests) | WebKit | Fails too | Not related to wasm-vips |
| Uploading a HEIC file with a mismatched extension (2 tests) | WebKit | Fails too | Not related to wasm-vips |
| Big image size threshold: should finish uploading an image the browser cannot decode | Firefox, WebKit | Skipped | The test expects the browser to fail to decode a damaged JPEG. Only Chromium fails. Firefox and WebKit decode it, so a scaled copy is made. The upload still finishes. |
| Image: should undo without broken temporary state | Firefox | Passed, processed on the server | It failed 2 of 3 reruns. Chromium processes the image in the browser with both builds and passes, so this may be an editor bug in Firefox that is not related to the vips build. Not investigated. |
| Client-side media processing: preserves a transparent PNG even when PNG-to-JPEG is filtered | Firefox | Skipped | Flaky. It passed 3 of 3 reruns. |

The reruns ran the caption toolbar, undo and transparent PNG tests in Firefox with the build without threads, 3 times each, after the full run. They are not in `results/gutenberg-e2e.json`.

Three tests failed with the release build only: "allows rotating an image using the media editor modal" in Firefox and WebKit, and "should upload through prepublish panel" in Chromium.

## Run it yourself

```sh
npm run setup
npm run build
npm run gutenberg:test
```

The script clones Gutenberg at the pinned commit into `src/gutenberg-e2e`, applies the patches, builds Gutenberg and starts its test site with wp-env. It takes about an hour.
