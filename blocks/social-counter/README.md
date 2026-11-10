# Social counter

A responsive follower/subscriber counter block by [Tom](https://github.com/tsbekkers).
The number is entered by hand in the block settings. **The block does not fetch live
counts from any platform.**

## Layouts and appearance

- **Small (156 × 156):** platform logo, number and short label.
- **Medium (336 × 156):** logo, number and the full label.
- **Large (336 × 336):** a larger composition of the same content.

Supported platforms: YouTube, Instagram, TikTok, X, Facebook, Spotify, LinkedIn,
Twitch, Substack, and Other (no logo). Logos are simplified inline marks, not
official brand assets. Follows the Quillow theme (light/dark, host font, corner
style); the platform colour can be switched off in favour of the page accent.

## Editor settings

Open the block's settings (gear) to configure:

- **Platform, Label:** the label defaults to the platform's usual word (up to 40
  characters if customized).
- **Profile link:** optional; must start with `https://`. Makes the whole block a link.
- **Current count:** 0 to 9,999,999,999. Update it whenever the number should change.
- **Number style:** full (`48,200`) or compact (`48.2K`, from 10,000 up).
- **Simulate daily growth:** off by default. When on, the displayed number rises
  through the day by a deterministic random amount between the configured daily
  minimum and maximum, starting from the date the count was saved. **This is a
  projection, not a measured figure**, and the same value is shown to every visitor.
  Use it only where that is not misleading, and update the real count regularly.

Settings use the `settings` storage key as explicit JSON text. Public visitors can
only read.

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
