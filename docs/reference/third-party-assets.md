# Third-party assets

The assets Lire ships that Lire does not own, with the terms found for each. The Credits page
([Credits.tsx](../../src/client/components/app/credits/Credits.tsx)) gives the user-facing
attribution; this page is the record behind it. The libraries of the Libraries card are generated
from `package.json` and gated by [check-credits-libraries.ts](../../scripts/check-credits-libraries.ts).

## Assets

| Asset | File | Source | Terms found | Checked | Status |
| --- | --- | --- | --- | --- | --- |
| NewsBlur logo | [newsblur-logo.svg](../../src/client/assets/newsblur-logo.svg) | NewsBlur repository, [media/img/logo.svg](https://github.com/samuelclay/NewsBlur/blob/master/media/img/logo.svg), byte-identical (sha256 `78bee496…`) | Repository licence [MIT](https://github.com/samuelclay/NewsBlur/blob/master/LICENSE.md), copyright Samuel Clay. The licence names no logo, artwork or trademark carve-out. [README](https://github.com/samuelclay/NewsBlur/blob/master/README.md) states only the MIT licence. The [press page](https://newsblur.com/press) offers a 512 px logo for press use with no usage terms. | 2026-10-23 | Unclear. The MIT grant covers the software; no explicit permission for the logo artwork or the name was found. |

## Open points

- The NewsBlur logo is shown on the Credits page. No published terms cover its artwork or name
  beyond the MIT licence of the software.
- The Play listing (`PLAY_STORE_URL` in [androidApp.ts](../../src/client/utils/androidApp.ts)) returned
  HTTP 404 when checked, so the link resolves only once the app is listed.
