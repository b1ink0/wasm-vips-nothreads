# wasm-vips without threads

An experiment: [wasm-vips](https://github.com/kleisauke/wasm-vips) compiled without WebAssembly threads, to find out whether client-side media processing in WordPress needs a cross-origin isolated page.

## Finding

In the browser, the release build of wasm-vips already runs libvips with one worker thread, and WordPress runs all processing in one worker. So in WordPress its threads do no parallel work, yet they are the only reason the editor must be cross-origin isolated: threads share memory through `SharedArrayBuffer`, which browsers only allow on isolated pages.

The same wasm-vips commit built without threads needs no isolation. For the work WordPress does, it runs within 4% of the release build in either direction, and its output is byte-identical.

Every WordPress image size of a 24 MP JPEG, encoded as JPEG and WebP, in one worker. Median of 5 runs on an Apple M3:

| Browser | Release build, isolated page | Release build, plain page | Without threads, plain page |
|---|:-:|:-:|:-:|
| Chromium | 1830 ms | ❌ | 1771 ms |
| Firefox | 1897 ms | ❌ | 1961 ms |
| WebKit | 1709 ms | ❌ | 1784 ms |

- ❌: the release build does not work without isolation. Start-up does not finish within 60 seconds in Chromium and Firefox, and WebKit throws on the first image.
- With AVIF added, or with a 50 MP input, the difference stays within 4%. AVIF output is byte-identical too.
- The build without threads also ran in every browser tried on an Android phone and an iPhone. See [Phones](docs/benchmarks.md#phones).
- In WordPress, the release build starts its thread pool with the vips worker: 9 workers for one upload in Chromium and Firefox, where the build without threads starts 1.

All tables and the method: [Benchmarks](docs/benchmarks.md).

## Where it runs in WordPress 7.2

Where an image uploaded in the block editor is processed: ✅ in the browser, ❌ on the server.

| Browser | Release build (core) | Build without threads |
|---|:-:|:-:|
| Chrome, Edge and other Chromium browsers, desktop | ✅ | ✅ |
| Chrome and Samsung Internet, Android | ✅ | ✅ |
| Firefox, desktop | ❌ | ✅ |
| Firefox, Android | ❌ | ✅ |
| Safari, macOS | ❌ | ✅ |
| Safari, iPhone | ❌ | ✅ |

- Core isolates the editor with `Document-Isolation-Policy`, which only Chromium browsers support. Chrome 158 and Samsung Internet 31 on Android supported it in the test.
- The build without threads was tested in WordPress through the demo plugin below: in Chromium, Firefox and WebKit on macOS, in Chrome, Samsung Internet and Firefox on an Android phone, and in Safari on an iPhone. See [WordPress plugin](docs/wordpress-plugin.md).
- [Client Side Media Everywhere](https://wordpress.org/plugins/client-side-media-everywhere/) makes the release build work in Firefox and Safari by sending COOP and COEP headers, on the iPhone too. On the Android phone, Firefox 160 received those headers but did not isolate the page, so the upload went to the server. See [Android phone](docs/wordpress-plugin.md#android-phone).

## What it could mean for WordPress

- Core could load a build without threads when the page is not cross-origin isolated, and keep the release build where it is.
- `@wordpress/upload-media` would then check whether the loaded build needs `SharedArrayBuffer`, instead of always requiring it.
- Using more cores without threads means more workers, each with its own wasm-vips heap of 256 MiB or more. See [Where the parallelism goes](docs/how-it-works.md#where-the-parallelism-goes).

## Try it

- **In your browser:** the [benchmark pages](https://b1ink0.github.io/wasm-vips-nothreads/) run both builds and show the images they make. You can also pick your own image.
- **In WordPress:** open the demo plugin in [WordPress Playground](https://playground.wordpress.net/?blueprint-url=https://b1ink0.github.io/wasm-vips-nothreads/blueprint.json), which starts the latest WordPress 7.2 beta or RC with the plugin active, or download the [test build](https://b1ink0.github.io/wasm-vips-nothreads/wasm-vips-nothreads-demo-0.1.0.zip) and upload it on the **Plugins** screen.

The demo plugin replaces the vips worker of WordPress 7.2 with one that bundles the build without threads, stops core's `Document-Isolation-Policy` header, and defines a placeholder `SharedArrayBuffer` so the editor's check passes. It is not meant to run alongside Client Side Media Everywhere. Details and limits: [WordPress plugin](docs/wordpress-plugin.md).

## Development

Needs Node.js 22.22.2 or 24.15 and later, Docker for the wasm-vips build and the WordPress test, and Composer for the PHP coding standards.

```sh
npm install
npm run setup           # download, verify and clone the pinned sources, apply the patches
npm run build           # build both wasm-vips variants in Docker (the first build takes a while)
npm run bench           # every Node and browser benchmark, written to results/
npm run wordpress       # build the plugin worker, start WordPress at http://localhost:8889 (admin, password)
npm run wordpress:test  # upload images in Chromium, Firefox and WebKit with each plugin setup
npm run plugin:zip      # zip the plugin into build/
npm run deploy          # publish the benchmark pages, the plugin zip and the Blueprint to GitHub Pages
```

To test WordPress on a phone, expose it through an HTTPS tunnel, for example `cloudflared tunnel --url http://localhost:8889`, and change the `admin` password first. Every command is listed in [AGENTS.md](AGENTS.md).

## Documentation

| Document | Contents |
|---|---|
| [How it works](docs/how-it-works.md) | Why the release build needs isolation, each patch, and where the parallelism goes. |
| [Benchmarks](docs/benchmarks.md) | Method, setups and every result table. |
| [WordPress plugin](docs/wordpress-plugin.md) | What the plugin changes, the test setup and its results. |
| [Updating](docs/updating.md) | Where each version is pinned and how to move to a new release. |
| [AGENTS.md](AGENTS.md) | Layout, commands and conventions for coding agents. |

## License

The scripts, pages and patches are released under the MIT license, see [LICENSE](LICENSE). The WordPress plugin is released under GPL-2.0-or-later, see its [readme](plugins/wasm-vips-nothreads-demo/readme.txt).

Third-party code keeps its own license:

| Code | License | Where |
|---|---|---|
| [wasm-vips](https://github.com/kleisauke/wasm-vips) | MIT | Built from source, bundled in the plugin worker |
| [libvips](https://github.com/libvips/libvips) | LGPL-2.1-or-later | Built from source, bundled in the plugin worker |
| [`@wordpress/vips` and `@wordpress/worker-threads`](https://github.com/WordPress/gutenberg) | GPL-2.0-or-later | Bundled in the plugin worker |
| [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) 0.1.7 | MIT | `site/iso/coi-serviceworker.js` |
| Upstream patches by the wasm-vips author | Licenses of the projects they patch | `upstream/*.patch` |

🤖 Made with [Claude Code](https://claude.com/claude-code)
