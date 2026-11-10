# Before and after slider

A responsive image comparison block by [Tom](https://github.com/tsbekkers). Visitors
drag a handle to reveal a before image over an after image.

## Layouts and appearance

- **Small (156 × 156):** the comparison with a compact handle and shortened labels.
- **Medium (336 × 156):** a wide comparison with labels.
- **Large (336 × 336):** a square comparison with labels.

Follows the Quillow theme (light/dark, host font, corner style). The handle is a
keyboard-operable slider with `aria-valuenow`/`aria-valuetext`, and the hint
animation is skipped when reduced motion is preferred. With no images added, two
built-in default images (`default-before.jpg`, `default-after.jpg`) are shown.

## Editor settings

Open the block's settings (gear) to configure:

- **Before image / After image:** uploaded images are resized and compressed in the
  editor to WebP (or JPEG), at most 720 px and 60,000 characters each, to fit
  Quillow's storage limit. Very fine detail may soften. Use the same framing for both.
- **Show labels, Before label, After label:** up to 24 characters each. On the small
  layout a long label may be truncated.
- **Direction:** horizontal or vertical.
- **Starting position:** 0–100.
- **Nudge on load:** the handle sweeps once to show it can be dragged.

Storage keys, all explicit strings: `settings` (JSON text), `image-before` and
`image-after` (image data URLs, validated as WebP/JPEG/PNG before display).
Public visitors can only read.

## Network and privacy

No network access. The manifest declares no `network.allowedOrigins`, and the block
makes no external requests, loads no remote fonts or images, and uses no analytics.
Theme, font and corner style come from Quillow through the bundled SDK runtime.

## Local preview and checks

Serve `package/` over local HTTP. Standalone, without a Quillow host, the block shows
its built-in default content and does not read or write storage. Embedded views
need the host's storage read capability; saving settings needs owner mode.

Before submitting:

```sh
npm run check
npm run check:versions -- --base "$(git rev-parse origin/main)"
npm run build
```

Screenshots are standalone captures of the default content in Chromium; see
[screenshot details](screenshots/README.md). The author tested the built ZIP in
Quillow. The maintainer-run browser checks have not been repeated for this entry,
and archive validation does not establish security.

## Updates and compatibility

This is the initial entry (unpublished `0.0.0`; release-please prepares `1.0.0`).
No storage migration is needed. Saved settings carry a version field (`v: 1`) and
are normalized on read, so missing or invalid values fall back to defaults. Updating
a block does not change users' installed copies or their stored settings.

## License

MIT, as a contribution to this repository. The SDK's MIT notice is retained in
`THIRD_PARTY_NOTICES` and at the top of the packaged `runtime.js`, which is a
build that predates SDK 0.6.0.
