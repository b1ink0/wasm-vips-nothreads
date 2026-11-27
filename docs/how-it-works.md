# How it works

## Why the release build needs cross-origin isolation

wasm-vips is libvips compiled to WebAssembly with Emscripten. The release build is compiled with `-pthread`: libvips runs its work on a pool of threads, and Emscripten implements each thread as a Web Worker that shares one `WebAssembly.Memory` created with `shared: true`.

Shared WebAssembly memory is backed by a `SharedArrayBuffer`. Browsers only expose `SharedArrayBuffer` on pages that are cross-origin isolated (`self.crossOriginIsolated === true`). A page becomes isolated in one of two ways:

- **COOP and COEP headers** (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` or `credentialless`). Every browser supports them, but they apply to the whole page: cross-origin popups lose their link to the opener, and cross-origin embeds without CORP or CORS headers are blocked in `require-corp` mode.
- **`Document-Isolation-Policy`**, which isolates only the document that sends it. Chromium 137 and later support it.

Without isolation, the release build does not work. See [Release build without isolation](benchmarks.md#release-build-without-isolation).

WordPress 7.2 runs this build in the block editor to process uploaded images in the browser. Core sends `Document-Isolation-Policy` on the editor and media screens, so client-side processing works in Chromium browsers and falls back to the server in Firefox and Safari.

## What the build without threads changes

The same wasm-vips commit (v0.0.19, libvips 8.18.7, Emscripten 6.0.10) is built without `-pthread`. The memory is then ordinary, unshared memory, so the module runs on any page.

libvips assumes it can start threads, so a few places need changes. Each is a patch in [`patches/`](../patches):

| Patch | Applies to | Change |
|---|---|---|
| `nothreads-wasm-vips.patch` | wasm-vips | Drops `-pthread` from the compiler flags and `PTHREAD_POOL_SIZE` from the link flags. Drops the `VIPS_MAX_THREADS` and `VIPS_CONCURRENCY` defaults, which only size the thread pool. Makes `proxy_sync()` call the function directly, since there is no main thread to hand it to. Builds resvg, the SVG loader, without the Rust `atomics` target feature. Applies the four patches below during the build. |
| `libvips-nothreads.patch` | libvips | Runs the work libvips gives to threads on the calling thread. See [The libvips patch](#the-libvips-patch). |
| `meson-nothreads.patch` | Meson | Meson adds `-pthread` for every `dependency('threads')` on Emscripten. The patch makes it add nothing. |
| `emscripten-growable-random.patch` | Emscripten | The build uses resizable memory (`GROWABLE_ARRAYBUFFERS`). Web Crypto rejects views of resizable buffers, like views of shared ones, so `getrandom` copies through a temporary buffer in both cases. |
| `emscripten-vector-heap.patch` | Emscripten | Fixes the helper from wasm-vips' own Emscripten patch that passes number arrays in and out of wasm. It kept the memory view from startup. Memory growth replaces views of non-shared memory, so after the first growth the helper failed with "detached ArrayBuffer". It now looks the view up on each call. |
| `pin-vendored.patch` | wasm-vips | Shared by both builds. Pins the emsdk image by digest and Meson to 1.12.1, and reads the upstream patches from `upstream/` (mounted as `/vendor` in the build container) instead of downloading them during the build. Adds `-msimd128` to the libpng flags: libpng 1.6.58's configure fails with `-msse4.1` alone under Emscripten. Applies `upstream/emscripten-mimalloc-pagemap.patch` to Emscripten, a backport of [emscripten#27982](https://github.com/emscripten-core/emscripten/pull/27982) (Emscripten 6.0.13), which fixes the heap growth of wasm-vips 0.0.19 reported in [wasm-vips#135](https://github.com/kleisauke/wasm-vips/issues/135). |

Everything else stays the same: the libraries, their versions and the codecs.

### The libvips patch

Without `-pthread`, Emscripten's `pthread_create` fails with "Not supported". GLib only returns an error for "try again" and aborts on any other code, so every thread libvips starts would abort the whole module. The patch changes these places, only in Emscripten builds without pthreads.

What wasm-vips needs:

| Change | What it fixes |
|---|---|
| `vips_threadpool_run()` runs one worker on the calling thread. | Computing any image. `vips_sink()`, `vips_sink_disc()` and `vips_sink_memory()` all start their workers through it. |
| `vips_sink_disc()` writes each buffer on the calling thread. | Saving to a file, buffer or target with the JPEG, PNG, WebP, GIF, TIFF, HEIF and JPEG XL savers, which start a background writer thread. |
| `vips_thread_isvips()` returns true, and the outermost pipeline frees the buffer cache when it is done. | Running out of memory, for example in `colour colourspace` and `foreign heifload`. libvips only gives its own threads a buffer cache, and the calling thread now does all the work. |

So the rest of the libvips API fails with an error instead of aborting. wasm-vips does not set `VIPS_MAX_THREADS` or start other threads, but a caller can:

| Change | What it fixes |
|---|---|
| `vips_g_thread_new()` returns an error instead of starting a thread. | Any other thread start, such as `vips_thread_execute()`. |
| `VIPS_MAX_THREADS` is ignored on startup. | The abort on startup when it is set, since libvips starts that many threads during `vips_init()`. |

These work without a change:

- **Progress feedback** (`onProgress`). The worker reports progress after each tile, as the thread pool does.
- **The threaded tile cache.** It only waits when another thread is computing the tile it needs, which can't happen with one thread.
- **`vips_sink_screen()`.** wasm-vips' own libvips patch already makes it run without a background thread, in every wasm-vips build.

## Where the parallelism goes

Without threads, one wasm-vips instance processes one image on one thread. To use more cores, run several instances, each in its own Web Worker. Workers do not share memory, so they need no isolation.

The trade-off is memory: every instance has its own heap, which starts at 256 MiB and grows as needed. Four workers hold four heaps.

On the web the release build sets `VIPS_CONCURRENCY` to 1, so libvips uses one worker thread there too. Its source says dedicated workers cannot be started safely on the web, and the limit avoids deadlocks.

## The WordPress plugin

WordPress loads the vips worker as the `@wordpress/vips/worker` script module. The plugin in [`plugins/wasm-vips-nothreads-demo`](../plugins/wasm-vips-nothreads-demo) registers a rebuild of that module, made from the same Gutenberg sources as WordPress 7.2 RC3 but bundled with the build without threads. Then it:

- stops core from sending `Document-Isolation-Policy`,
- defines a placeholder `SharedArrayBuffer` on pages without one.

The placeholder is needed because `@wordpress/upload-media` checks for `SharedArrayBuffer` before it enables client-side processing. See [Limits](wordpress-plugin.md#limits).
