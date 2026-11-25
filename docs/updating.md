# Updating the pinned versions

Every input is pinned so a build can be reproduced: source commits, release archives (by SHA-256), Docker images (by digest) and npm packages (exact versions). Updating one means changing the pin, refreshing the patches that touch it, rebuilding, and running the benchmarks and the WordPress test again.

## Where each pin lives

| What | Where |
|---|---|
| wasm-vips commit | `WASM_VIPS` in `scripts/setup.ts` |
| Gutenberg commit (the `@wordpress/vips` sources of the WordPress release) | `GUTENBERG` in `scripts/setup.ts` |
| Gutenberg commit of the e2e test | `GUTENBERG` in `scripts/gutenberg-e2e.ts` |
| WordPress commit of the e2e test | `core` in `.wp-env.test.json`, changed by `patches/gutenberg-e2e.patch` |
| libvips and npm release archives | `DOWNLOADS` in `scripts/setup.ts`, hashes in `upstream/SHA256SUMS` |
| Upstream patches that wasm-vips downloads during its build | `upstream/*.patch`, hashes in `upstream/SHA256SUMS` |
| emsdk image and Meson version | `patches/pin-vendored.patch` (the wasm-vips `Dockerfile`) |
| WordPress, MariaDB and WP-CLI images | `wordpress/compose.yml` |
| Client Side Media Everywhere version in the test | `CSME_VERSION` in `scripts/wordpress-test.ts` |
| Node packages | `package.json` and `package-lock.json` |
| PHP coding standards | `composer.json` and `composer.lock` |

## A new wasm-vips or libvips release

1. Change `WASM_VIPS` to the release commit. Download the new archives and upstream patches that its `build.sh` and `Dockerfile` fetch into `upstream/`, update `DOWNLOADS`, and regenerate `upstream/SHA256SUMS` with `shasum -a 256`.
2. Move `src/` aside and run `npm run setup`. A patch that no longer applies stops the setup.
3. Refresh the patches that failed:
   - `pin-vendored.patch` and `nothreads-wasm-vips.patch` are diffs of the wasm-vips tree. Edit the files in `src/baseline` or `src/nothreads` and save `git -C src/<variant> diff` as the patch. `nothreads-wasm-vips.patch` holds the changes of `src/nothreads` minus those of `pin-vendored.patch`.
   - `libvips-nothreads.patch`, `meson-nothreads.patch` and `emscripten-growable-random.patch` are made with `diff -ruN` between an unpacked upstream tree and a copy with the change. Keep the paths one level deep, since `build.sh` applies them with `patch -p1`.
4. Run `npm run build`. The full log is in `results/build-<variant>.log`.
5. Run `npm run bench` and compare with the previous results. The output hashes in the JSON files show whether the images changed.

## A new WordPress release

1. Find the Gutenberg commit the release ships: wordpress-develop pins it in `package.json` as `gutenberg.sha` on the release branch. Set it as `GUTENBERG` in `scripts/setup.ts`.
2. Move `src/gutenberg` aside, run `npm run setup`, then `npm run wordpress worker`.
3. Change the `wordpress` image in `wordpress/compose.yml` to the release tag and pin its digest.
4. Run `npm run wordpress:down`, `npm run wordpress` and `npm run wordpress:test`.
5. Check that the hooks the plugin depends on still exist in the release: the `@wordpress/vips/worker` script module ID, the `wp_set_up_cross_origin_isolation` hooks, the `wp-upload-media` script handle and the `SharedArrayBuffer` check in `@wordpress/upload-media`.
6. Update `Tested up to` and, if the worker changed, the version in `plugins/wasm-vips-nothreads-demo/`.

## A new Gutenberg commit for the e2e test

1. Set `GUTENBERG` in `scripts/gutenberg-e2e.ts` to the new commit and move `src/gutenberg-e2e` aside.
2. Run `npm run gutenberg:test`. A patch that no longer applies stops the script.
3. Refresh the patches that failed: change the files in `src/gutenberg-e2e` and save `git -C src/gutenberg-e2e diff` of the test files as `gutenberg-e2e.patch` and of the other files as `gutenberg-nothreads.patch`. New files need `git diff --no-index /dev/null <file>`.
4. Check that `SPECS` in the script still lists every spec that uploads media.
