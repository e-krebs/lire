# Third-party assets

The assets Lire ships that Lire does not own, with the terms found for each. The Credits page
([Credits.tsx](../../src/client/components/app/credits/Credits.tsx)) gives the user-facing
attribution; this page is the record behind it. The libraries of the Libraries card are generated
from `package.json` and gated by [check-credits-libraries.ts](../../scripts/check-credits-libraries.ts).

## Assets

| Asset | File | Source | Terms found | Checked | Status |
| --- | --- | --- | --- | --- | --- |
| NewsBlur logo | [newsblur-logo.svg](../../src/client/assets/newsblur-logo.svg) | NewsBlur repository, [media/img/logo.svg](https://github.com/samuelclay/NewsBlur/blob/master/media/img/logo.svg), byte-identical (sha256 `78bee496…`) | Repository licence [MIT](https://github.com/samuelclay/NewsBlur/blob/master/LICENSE.md), copyright Samuel Clay. The licence names no logo, artwork or trademark carve-out. [README](https://github.com/samuelclay/NewsBlur/blob/master/README.md) states only the MIT licence. The [press page](https://newsblur.com/press) offers a 512 px logo for press use with no usage terms. | 2026-10-23 | Unclear. The MIT grant covers the software; no explicit permission for the logo artwork or the name was found. |
| Google Play badge, English | [badge-en.png](../../src/client/assets/google-play/badge-en.png) | Google Play badges page, [play.google.com/intl/en_us/badges](https://play.google.com/intl/en_us/badges/) | Google Play badge guidelines, linked from the [lockups page](https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/) | 2026-10-23 | Clear space and no alteration are stated. The attribution line and minimum size are not in the fetched pages; the guideline zip was not read. |
| Google Play badge, French | [badge-fr.png](../../src/client/assets/google-play/badge-fr.png) | Downloaded from Google's badge page and viewed to confirm it is the official French badge | As the English badge | 2026-10-23 | As the English badge |

## Rules for the badges

- A badge is never altered: not resized in the file, recoloured, re-encoded, cropped, stretched or
  given effects. The page shows it at its supplied colours.
- It keeps clear space and is not used as a tile or a button background.
- The English badge shows unless the Lire locale is `fr`
  ([AndroidBadge.tsx](../../src/client/components/app/auth/landing/AndroidBadge.tsx)).
- Monochrome use needs permission, and no monochrome version is used.

## Open points

- The NewsBlur logo is shown on the landing step cards and on the Credits page. No published terms
  cover its artwork or name beyond the MIT licence of the software.
- The Play listing (`PLAY_STORE_URL` in [androidApp.ts](../../src/client/utils/androidApp.ts)) returned
  HTTP 404 when checked, so the link resolves only once the app is listed.
