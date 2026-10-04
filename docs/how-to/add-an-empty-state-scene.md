# Add an empty-state scene

Add a new "doing nothing" scene to the art shown above an empty article list. The sources live in
[art/empty-state/](../../art/empty-state/README.md); the app ships the colour style. How the art is
picked and shown is in [architecture.md](../explanation/architecture.md#empty-state-art).

## Steps

1. Download Chrome Headless Shell for macOS arm64 from the
   [Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/) downloads and
   unzip it to `art/empty-state/chrome-headless-shell-mac-arm64/`. `capture.py` looks for the
   binary there. Skip this when the folder exists.
2. Add the scene to `art/empty-state/colour/tiles.html`, starting from an existing scene, and add
   its name to the scene list in `capture.py`. Use no people, one or two hero objects and few small
   props.
3. Render from the repo root:

   ```sh
   python3 art/empty-state/colour/capture.py
   ```

   It writes `<scene>-light.png` and `<scene>-dark.png` (960 × 600) into `colour/renders/`, plus
   `review-320.png`, and fails when an image has no transparent margin.
4. Review each image at full size and in `review-320.png` at 320 × 200 on `#f1f3f4` (light) and
   `#1f1f1f` (dark). Fix any object that does not read at that size.
5. Convert each PNG into `src/client/assets/empty/`:

   ```sh
   cwebp -q 85 -alpha_q 100 <scene>-light.png -o src/client/assets/empty/<scene>-light.webp
   ```

   Repeat for `-dark`.
6. Add the scene name to `EMPTY_SCENES` in
   [emptyScenes.ts](../../src/client/components/articles/MosaicGrid/emptyScenes.ts).
7. Check both phases in the `Components/MosaicEmptyArt` Gallery story (`yarn storybook`).
