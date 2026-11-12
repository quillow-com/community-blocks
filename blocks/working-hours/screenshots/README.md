# Screenshot provenance

Three separate Chromium captures of the actual packaged HTML/CSS/JavaScript,
taken on 2026-11-12 at 1× pixel density:

| File         | Layout | Dimensions   |
| ------------ | ------ | ------------ |
| `small.png`  | Small  | 156 × 156 px |
| `medium.png` | Medium | 336 × 156 px |
| `large.png`  | Large  | 336 × 336 px |

Captured by `test/browser.mjs --screenshots`, served over local HTTP in the
documented sandbox/CSP with a scripted SDK host, a missing settings record, light
theme and system font. These are the block's built-in default hours, not a real
business listing. The browser clock is fixed at **2026-11-12 10:30 UTC** so all three
layouts show the same reproducible status. The visitor time zone in the fixture
is Pacific/Honolulu; the block correctly uses its configured UTC business zone.

Each capture uses its own exact viewport dimensions, with no browser chrome,
extra borders, resizing or post-processing. These are not live Quillow app
screenshots. Images stay outside `package/` and never enter the upload ZIP.
