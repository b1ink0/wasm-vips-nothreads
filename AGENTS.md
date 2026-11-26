# AGENTS.md

Guidance for coding agents working in this repository. Read the [README](README.md) and [docs/how-it-works.md](docs/how-it-works.md) first.

## Layout

| Path | Contents |
|---|---|
| `scripts/` | TypeScript scripts that run every step. Node runs them directly (type stripping), there is no build step. |
| `patches/` | Patches applied to wasm-vips, libvips, Meson and Emscripten. The changes that make the build work without threads. `gutenberg-*.patch` apply to the Gutenberg clone of the e2e test. |
| `upstream/` | Upstream patches and `SHA256SUMS`. `npm run setup` downloads the release archives next to them. |
| `plugins/wasm-vips-nothreads-demo/` | The WordPress plugin. `build/` is generated. `.wordpress-org/` holds the plugin icon: edit the SVG, then run `npm run plugin:assets`. |
| `wordpress/` | Docker Compose setup for the WordPress test. |
| `site/` | The browser benchmark pages, published to GitHub Pages by `npm run deploy`. |
| `images/` | Test photos, downloaded and checked by `npm run images` and committed. |
| `results/` | Benchmark and test results as JSON, written by the scripts and committed. |
| `docs/` | Documentation. |

Generated and ignored: `src/` (pinned clones), `work/` (trees for making patches), `build/` (the GitHub Pages site and the plugin zip), `node_modules/`, `vendor/` (Composer), `plugins/*/build/`.

## Commands

| Command | What it does |
|---|---|
| `npm run setup` | Downloads and verifies the archives, clones the pinned sources into `src/` and applies the patches. |
| `npm run build [baseline\|nothreads]` | Builds wasm-vips in Docker. Takes a long time on the first run. |
| `npm run bench` | Every Node and browser benchmark behind the tables in `docs/benchmarks.md`. |
| `npm run wordpress` | Builds the plugin worker and starts WordPress at http://localhost:8889. |
| `npm run wordpress:test` | Uploads a 24 MP and a 50 MP image 3 times each in Chromium, Firefox and WebKit with each plugin setup, and records time, memory and workers. |
| `npm run gutenberg:test` | Clones Gutenberg into `src/gutenberg-e2e` and runs its media e2e tests in Chromium, Firefox and WebKit, once with the release build and once with the build without threads. Takes about an hour. |
| `npm run plugin:assets` | Renders the icon SVG in `.wordpress-org/` to the PNG sizes WordPress.org uses. |
| `npm run plugin:zip` | Checks that the plugin versions match, copies the plugin to `build/wasm-vips-nothreads-demo/` and zips it as `build/wasm-vips-nothreads-demo-<version>.zip`, with its SHA-256 in `build/wasm-vips-nothreads-demo-<version>.zip.sha256`. |
| `npm run tsc` | TypeScript check of `scripts/`. |
| `npm run lint-js` | ESLint with the `@wordpress/scripts` config, Prettier included. |
| `npm run format-js` | Formats JS, TS, JSON and YAML with the WordPress Prettier config. |
| `npm run lint-php` | WordPress Coding Standards for the plugin. Run `composer install` first. |

A husky pre-commit hook runs lint-staged, which lints and type-checks the staged files.

## Conventions

- **Scripts:** TypeScript with erasable syntax only (no enums, namespaces or parameter properties), imports with the `.ts` extension, Node 22.22.2 or 24.15 and later. No shell or Python scripts.
- **Pins:** every version is exact. Commits, archive hashes and Docker image digests are listed in [docs/updating.md](docs/updating.md). Do not loosen a pin.
- **Patches:** change the sources in `src/`, then regenerate the patch as described in `docs/updating.md`. Never edit a build output.
- **Results:** files in `results/` come from the scripts only. Never edit them by hand. Rerun the script and commit the new file.
- **Docs:** every number in the docs comes from a file in `results/`, except the phone results, which were read from screenshots of the published pages and from the server log of the test site. Update the docs in the same change as the results.
- **Plugin:** follows the WordPress Coding Standards. Prefix every global with `wasm_vips_nothreads_demo`, use the text domain `wasm-vips-nothreads-demo`, keep `readme.txt` in the WordPress.org format, and keep the version in `load.php` and `readme.txt` the same.

## Checks before a change is done

1. `npm run tsc` and `npm run lint-js`
2. `npm run lint-php` when the plugin changed.
3. `npm run wordpress:test` when the plugin, the worker or the nothreads build changed.
4. `npm run bench` when the builds changed.
