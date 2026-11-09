# Screenshot provenance

These are separate Chromium captures of the actual block at 1× pixel density,
taken on 2026-11-09:

| File         | Layout | Image dimensions |
| ------------ | ------ | ---------------- |
| `small.png`  | Small  | 156 × 156 pixels |
| `medium.png` | Medium | 336 × 156 pixels |
| `large.png`  | Large  | 336 × 336 pixels |

The browser rendered the packaged HTML/CSS/JS in a cross-origin iframe. A local
host-contract harness supplied the official SDK's theme/layout context and saved
BTC/USD pair. Quotes came directly from CoinPaprika over browser fetch, without
mock market values. The historical endpoint returned HTTP 402, so the medium and
large captures honestly show that history is unavailable instead of a fake chart.

The images are not resized versions of one capture. No Quillow account credentials
or real user storage were used. Host authorization and the actual Quillow settings
modal still require an integration check in the application; the local harness is
not proof of that behavior. Separate mock responses used for failure-path tests
are not the source of these catalog images.

These catalog assets stay outside `package/` and never enter the upload ZIP.
