# Colour scenes

Twenty-two scenes, each in daylight and dusk. The 44 transparent PNGs are 960 × 600 pixels, intended for display at 320 × 200.

## Open and export

Open [tiles.html](tiles.html) in a browser with WebGL2 to render the gallery and download individual PNGs. Geometry and generated textures are embedded in the page. The only network dependency is three.js 0.180.0, loaded from jsDelivr through the pinned import map.

From the workspace root, run:

```sh
python3 art/empty-state/colour/capture.py
```

From this folder, run `python3 capture.py`. The [capture script](capture.py) uses only `../chrome-headless-shell-mac-arm64/chrome-headless-shell` (a sibling of `colour/` and `ink/`, not archived). It starts a loopback server, launches the bundled browser with software rendering and a temporary profile, then closes both and removes the profile.

Each run writes 44 scene PNGs into `renders/`, named `<scene>-light.png` and `<scene>-dark.png`. It also writes `review-320.png`, `qa.json` and `chrome.log` beside this file (not archived). Each preview on the contact sheet is exactly 320 × 200. Eight inspection angles of `alpine-lake` and `lighthouse-jetty` go into `review-angles/` (not archived). Light previews use #f1f3f4; dark previews use #1f1f1f. The renders are not archived, because the WebP files in `src/client/assets/empty/` are these renders.

The capture checks that all 44 images were exported, each is 960 × 600, and every image has transparent pixels and clear margins. The QA report records bounds, transparency, bath-wall opacity samples and geometry checks (grounded rocks, no clipping, evenly spaced bollards, wall edges). `capture.py` asserts those checks. If capture fails, inspect `chrome.log`.

## Modelling

The scenes use flat-shaded forms on bevelled hexagonal tiles. The bases have three solid layers, from y = -0.78 to y = 0.05, with small bevels. Scene-specific ground and floor colours sit above ochre soil and grey rock.

| Scene | Modelling details |
| --- | --- |
| hammock | Two trees with three dodecahedral crowns each, a curved hammock, a closed book and a red six-panel cap. The cap has a cream button and a short curved bill. |
| bath | Thick, opaque walls, a continuous plinth, a footless tub, connected soap suds, a small duck and a book on a stool. |
| spring | A checked picnic blanket, brimmed straw hat, closed book and flower clusters. |
| autumn | An orange tree, shaped fallen leaves, a slatted bench, book and mug with two steam trails. |
| winter | An opaque room corner, framed snowy window, armchair, fringed folded blanket and mug on a table. |
| fishing | A planked jetty, open bucket and rod held by a forked rod rest at 30 to 40 degrees. The slack line sags to a small float on the water. |
| cat | A sleeping cat with pointed ears, closed eyes and a curled tail. Newspaper headlines and columns come from an inline canvas. |
| rooftop | A chimney, reclining deck chair, folded blanket and mug. Five stars appear at dusk. |
| boat | An open wooden hull, two seats, two stowed oars and a book. The lower hull sits below the water, with reeds along the shore. |
| beach | A striped chair and umbrella, with sunglasses and a book on a towel beside a narrow band of sea. |
| alpine-lake | Several grey, angular rock masses of different heights with thick snow caps, gullies and foot patches. The lake runs off the tile edge. Boots, backpack, folded map and drying socks sit clear of the rocks, and every loose rock rests on the ground or another rock. |
| bivouac | A tent with solid sides, thick triangular back and raised floor above the ridge. A teal sleeping bag and cream pillow face the open entrance; a stove and mug sit outside. |
| hut-terrace | A complete hut with four walls, gables, a thick pitched roof, framed door and side window. The terrace holds a chair, boots, railing and a bench with a thermos and book. |
| coastal-bench | A folded blue-and-white towel with layered fabric and fringes. A small gull stands on the rail above it. Grey-pink granite uses deterministic mineral flecks projected onto the boulder faces. |
| lighthouse-jetty | A white and red lighthouse, stone jetty, a heap of rope net with floats and one corner over the edge, two red and white buoys, a wooden crate and a bollard. |
| granite-cottage | Coursed granite blocks with dark joints and pink, beige and black flecks, blue shutters, hydrangeas and paving. A bench holds a green cider bottle with a cream label and a ceramic bolée with amber cider. |
| bike-cafe | A cafe facade wall on the back edge of the hex, with window, awning and sign, over cobbles (pavés). A bike stands on its kickstand, with a table, espresso, croissant and a chair holding a blue helmet. |
| bike-canal | A canal towpath with water running off the edge, five evenly spaced bollards, a step-through city bike with a baguette in its basket leaning on one, and a bench with a bottle and a folded map. |
| poolside | A tiled pool deck with the pool running off the tile edges. The pool floor and walls use small mosaic tiles in nine blues, with a darker waterline band. A ladder, ring float, folded towel, goggles and a flat folded swim cap sit around it. |
| fireside | A stone fireplace built into a wall on the back edge, with angular flames and logs, a log basket, a woven carpet, a mug, a closed book and a pair of slippers. |
| paris-cafe | A cream facade with a dark green window frame on the back edge, a raised wooden platform with one step on cobbles, a marble bistro table with two red wines and two different lunches, two rattan chairs, a slate menu board and a potted shrub. |
| lake-peacock | A grassy lakeshore with the lake running off the tile edges, a low-poly peacock with a trailing tail, three bushes, a sapling, flower tufts, a fern, reeds and a rock. The day grass is a fresher green than the other scenes. |

## Palette and rendering

Representative material colours are listed below. Each model retains its own material variations.

| Material | Colours |
| --- | --- |
| Base rock | #99998d |
| Soil | #b7956e outdoors; #bc9979 beneath the bath |
| Grass and bath floor | a muted sage in most scenes, a fresher green in lake-peacock; #edccaa |
| Tree leaves | soft sage greens, a little less saturated than the dusk set |
| Book cover and pages | #d77c64; #eee4c9 |
| Hammock fabric | #efa38c |
| Alpine water | #86bcc4 |
| Tent canvas | #d79a79, #e3ac85 |
| Sleeping bag and pillow | #83aca8; #efe0bf |
| Granite texture | #b4adae with #7e8588, #c9afb0, #e0d7cc and #959da0 flecks |
| Cottage shutters | #7d9eb4 |

The renderer uses antialiasing, sRGB output, ACES filmic tone mapping and BasicShadowMap shadows at 4096 × 4096. Daylight combines a near-neutral warm hemisphere light and sun with a faint neutral fill, so day images carry no green cast; dusk uses lavender ambient light, a lower peach sun and a stronger violet fill. Exposure is 0.97 by day and 0.86 at dusk.

The orthographic camera uses view sizes 6.95 for tall scenes and 5.85 for the others, looking at y = 1.24 or 0.40 respectively. A masked 0.65-pixel blur softens the distant edges while the centre stays sharp.

The two rendering functions keep their own modelling helpers, camera setup and lights. Keep a scene with its existing helpers when editing; similar helper names do not imply interchangeable output.
