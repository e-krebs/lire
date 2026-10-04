# Ink scenes

Sixteen scenes, each with dark ink on light paper and light ink on dark paper. The 32 transparent PNGs are 960 × 600 pixels, intended for display at 320 × 200.

## Open and export

Open [tiles.html](tiles.html) in a browser with WebGL2 to render the gallery and download individual PNGs. Geometry, textures and print shaders are embedded in the page. The only network dependency is three.js 0.180.0, loaded from jsDelivr through the pinned import map.

From the workspace root, run:

```sh
python3 art/empty-state/ink/capture.py
```

From this folder, run `python3 capture.py`. The [capture script](capture.py) uses only `../chrome-headless-shell-mac-arm64/chrome-headless-shell` (a sibling of `colour/` and `ink/`, not archived). It starts a loopback server, launches the bundled browser with software rendering and a temporary profile, then closes both and removes the profile.

Each run writes 32 scene PNGs into `renders/`, named `<scene>-light.png` and `<scene>-dark.png`. It also writes `review-320.png`, `qa.json` and `chrome.log` beside this file. The contact sheet is 1352 × 1900 pixels, with four columns and each preview at exactly 320 × 200. Light previews use #f1f3f4; dark previews use #1f1f1f. The archive keeps the renders as WebP (`renders/*.webp`, `review-320.webp`); a run writes PNG.

The capture checks that all 32 images were exported, each is 960 × 600, and every image has transparent pixels and clear margins. The renderer also checks square-base projection and the presence of the assigned accent. The QA report records those measurements, image bounds and bath-wall opacity samples. If capture fails, inspect `chrome.log`.

## Modelling and accents

The models sit on square bases with three solid layers. The orthographic camera has a 45° azimuth and 35.264° elevation, giving symmetric base projections. Tall scenes use a 7.5-unit view; the others use 6.6. Each image has one yellow or blue accent.

| Scene | Modelling details | Accent |
| --- | --- | --- |
| hammock | Two faceted trees, curved hammock, baseball cap and closed book. | Yellow hammock fabric |
| bath | Thick opaque walls, footless tub, soap suds, small duck and book on a stool. | Blue bath water |
| spring | Checked blanket, straw hat, book and flowers. | Yellow sun hat |
| autumn | Tree, fallen leaves, slatted bench, steaming mug and book. | Yellow tree leaves |
| winter | Armchair, folded blanket, mug and framed snowy window. | Yellow window light |
| fishing | Planked jetty, bucket, rod, reel and float. | Blue pond water |
| cat | Curled sleeping cat on newspapers with inline canvas print. | Yellow cat |
| rooftop | Chimney, deck chair, blanket and mug, with stars in the dark version. | Yellow chair canvas in both themes |
| boat | Open hull, two seats, stowed oars, book and reeds. | Blue water |
| beach | Striped chair, umbrella, towel, sunglasses and book. | Yellow sand |
| alpine-lake | Snowy peak, lake and map. Boots have smooth outlines, cuff openings and two lace lines; the backpack sits on the opposite shore with pocket and flap seams. | Blue lake water |
| bivouac | Solid tent sides and back, raised floor, sleeping bag and pillow, stove and mug. | Yellow tent canvas |
| hut-terrace | Complete hut, pitched roof, door and window, terrace railing, boots and bench with a thermos and book. | Yellow chair canvas |
| coastal-bench | Large bench clear of the boulders, folded striped towel and a gull on the top rail. The gull is plain ink, including its beak. | Yellow towel, with paper stripes |
| lighthouse-jetty | Straight stone jetty with three paving joints. The lobster pot has three broad ribs, three rails, a carry loop and round entrance; halftone suggests the mesh. | Blue sea water |
| granite-cottage | Granite walls, wide shutters with a central seam, two full hydrangeas, and a bench with cider bottle and ceramic bolée. | Blue hydrangeas and shutters |

## Palette and print treatment

| Use | Colour |
| --- | --- |
| Light-mode ink | #1f1f1f |
| Light-mode paper | #f1f3f4 |
| Dark-mode ink | #e3e3e3 |
| Dark-mode paper | #1f1f1f |
| Yellow accent | #fcd34d |
| Blue accent | #7fb2e5 |

The exterior remains transparent. Normal and depth passes supply outlines, and a shaded pass supplies round halftone dots. Ink dots have a 9.6-pixel pitch at export size; accent dots have a 7.8-pixel pitch. The accent shifts 2.4 pixels right and 1.8 pixels down.

Water and beach sand use approximately 26% accent-dot coverage; other accents use approximately 58%. The sand mask covers the horizontal surface. The rooftop mask covers the canvas panels. Frames, props and layered base sides stay in ink unless assigned an accent above.

The renderer works at 1920 × 1200 and reduces to 960 × 600 with high-quality image smoothing. There is no tilt-shift blur. Both themes use the daylight lighting setup for the shaded pass, with exposures of 0.97 and 0.86 for the light and dark versions.

The two rendering functions keep their own modelling helpers, accent masks and print settings. Keep a scene with its existing helpers when editing; merging similarly named helpers can change the exported pixels.
