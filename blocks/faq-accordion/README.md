# FAQ accordion

A responsive frequently-asked-questions block by [Tom](https://github.com/tsbekkers).
Questions and answers are edited in the block settings.

## Layouts and appearance

- **Small (156 × 156):** one question at a time, with previous/next buttons and a
  toggle between the question and its answer.
- **Medium (336 × 156):** the current question beside its answer, with previous/next
  buttons and a counter.
- **Large (336 × 336):** an optional title and an expandable accordion list.

Follows the Quillow theme (light/dark, host font, corner style). Controls are real
buttons with labels and visible focus.

## Editor settings

Open the block's settings (gear) to configure:

- **Title:** up to 80 characters, shown in the large layout. Blank for none.
- **Open the first question:** starts the first answer expanded in the large layout.
- **Questions:** up to 30 items; question up to 160 characters, answer up to 1,000.
  Items without a question are dropped on save.

Settings use the `settings` storage key as explicit JSON text. Public visitors can
only read. Four sample questions appear until settings are saved.

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
