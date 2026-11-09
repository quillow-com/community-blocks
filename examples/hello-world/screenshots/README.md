# Required screenshots

Add three real screenshots of your block, in this order in `metadata.json`:

| File         | Layout | Image dimensions |
| ------------ | ------ | ---------------- |
| `small.png`  | Small  | 156 × 156 pixels |
| `medium.png` | Medium | 336 × 156 pixels |
| `large.png`  | Large  | 336 × 336 pixels |

Capture the block at each layout; do not just resize the same screenshot. Crop to
the block and capture at 1× pixel density (device scale factor 1), without browser
chrome or extra borders. PNG, JPEG and WebP are accepted, at most 2 MiB per file.
If using JPEG/WebP or different filenames, update the paths in `metadata.json`.

The generator intentionally creates no placeholder images. `npm run check` and
`npm run build` fail until all three real images exist with the required sizes.
These files stay outside `package/` and are never included in the upload ZIP.
