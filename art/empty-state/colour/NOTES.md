# Colour scenes

Sixteen scenes, each in daylight and dusk. The 32 transparent PNGs are 960 × 600 pixels, intended for display at 320 × 200.

## Open and export

Open [tiles.html](tiles.html) in a browser with WebGL2 to render the gallery and download individual PNGs. Geometry and generated textures are embedded in the page. The only network dependency is three.js 0.180.0, loaded from jsDelivr through the pinned import map.

From the workspace root, run:

```sh
python3 art/empty-state/colour/capture.py
```

From this folder, run `python3 capture.py`. The [capture script](capture.py) uses only `../chrome-headless-shell-mac-arm64/chrome-headless-shell` (a sibling of `colour/` and `ink/`, not archived). It starts a loopback server, launches the bundled browser with software rendering and a temporary profile, then closes both and removes the profile.

Each run writes 32 scene PNGs into `renders/`, named `<scene>-light.png` and `<scene>-dark.png`. It also writes `review-320.png`, `qa.json` and `chrome.log` beside this file (not archived). The contact sheet is 1352 × 1900 pixels, with four columns and each preview at exactly 320 × 200. Light previews use #f1f3f4; dark previews use #1f1f1f. The renders are not archived, because the WebP files in `src/client/assets/empty/` are these renders.

The capture checks that all 32 images were exported, each is 960 × 600, and every image has transparent pixels and clear margins. The QA report records bounds, transparency and bath-wall opacity samples. If capture fails, inspect `chrome.log`.

## Modelling

The scenes use flat-shaded forms on bevelled hexagonal tiles. The bases have three solid layers, from y = -0.78 to y = 0.05, with small bevels. Scene-specific ground and floor colours sit above ochre soil and grey rock.

| Scene | Modelling details |
| --- | --- |
| hammock | Two trees with three dodecahedral crowns each, a curved hammock, a closed book and a red six-panel cap. The cap has a cream button and a short curved bill. |
| bath | Thick, opaque walls, a continuous plinth, a footless tub, connected soap suds, a small duck and a book on a stool. |
| spring | A checked picnic blanket, brimmed straw hat, closed book and flower clusters. |
| autumn | An orange tree, shaped fallen leaves, a slatted bench, book and mug with two steam trails. |
| winter | An opaque room corner, framed snowy window, armchair, fringed folded blanket and mug on a table. |
| fishing | A planked jetty, open bucket and rod with reel. The line meets a small float at the pond surface. |
| cat | A sleeping cat with pointed ears, closed eyes and a curled tail. Newspaper headlines and columns come from an inline canvas. |
| rooftop | A chimney, reclining deck chair, folded blanket and mug. Five stars appear at dusk. |
| boat | An open wooden hull, two seats, two stowed oars and a book. The lower hull sits below the water, with reeds along the shore. |
| beach | A striped chair and umbrella, with sunglasses and a book on a towel beside a narrow band of sea. |
| alpine-lake | A snowy peak, alpine lake, hiking boots, drying socks, backpack and folded map. |
| bivouac | A tent with solid sides, thick triangular back and raised floor above the ridge. A teal sleeping bag and cream pillow face the open entrance; a stove and mug sit outside. |
| hut-terrace | A complete hut with four walls, gables, a thick pitched roof, framed door and side window. The terrace holds a chair, boots, railing and a bench with a thermos and book. |
| coastal-bench | A folded blue-and-white towel with layered fabric and fringes. A small gull stands on the rail above it. Grey-pink granite uses deterministic mineral flecks projected onto the boulder faces. |
| lighthouse-jetty | A white and red lighthouse, stone jetty, arched lobster pot with ribs and netting, and a three-turn rope coil beside a bollard. |
| granite-cottage | Granite walls, blue shutters, hydrangeas and paving. A bench holds a green cider bottle with a cream label and a ceramic bolée with amber cider and a blue-green rim. |

## Palette and rendering

Representative material colours are listed below. Each model retains its own material variations.

| Material | Colours |
| --- | --- |
| Base rock | #99998d |
| Soil | #b7956e outdoors; #bc9979 beneath the bath |
| Grass and bath floor | #bbcf8d; #edccaa |
| Tree leaves | #91b880, #a5c58b, #bad096, #8faf7b |
| Book cover and pages | #d77c64; #eee4c9 |
| Hammock fabric | #efa38c |
| Alpine water | #86bcc4 |
| Tent canvas | #d79a79, #e3ac85 |
| Sleeping bag and pillow | #83aca8; #efe0bf |
| Granite texture | #b4adae with #7e8588, #c9afb0, #e0d7cc and #959da0 flecks |
| Cottage shutters | #7d9eb4 |

The renderer uses antialiasing, sRGB output, ACES filmic tone mapping and BasicShadowMap shadows at 4096 × 4096. Daylight combines a warm hemisphere light and sun with a cool fill; dusk uses lavender ambient light, a lower peach sun and a stronger violet fill. Exposure is 0.97 by day and 0.86 at dusk.

The orthographic camera uses view sizes 6.95 for tall scenes and 5.85 for the others, looking at y = 1.24 or 0.40 respectively. A masked 0.65-pixel blur softens the distant edges while the centre stays sharp.

The two rendering functions keep their own modelling helpers, camera setup and lights. Keep a scene with its existing helpers when editing; similar helper names do not imply interchangeable output.
