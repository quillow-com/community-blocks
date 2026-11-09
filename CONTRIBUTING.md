# Contributing

## Submit a new block

1. Fork the repository, create a branch, and run `npm ci --ignore-scripts`.
2. Run `npm run new -- my-widget --author your-github-handle`.
3. Customize `blocks/my-widget/package/`, its README and metadata. Add the three
   required real screenshots before running checks or building.
4. Run `npm run format`, `npm run check`, and `npm run build`.
5. Test the resulting ZIP in Quillow and open a pull request with screenshots and
   a description of the browser/runtime checks you performed.

Use plain static HTML/CSS/JS for this first catalog version. No build or install
step runs for an individual block in CI or after upload. Do not submit only an
opaque ZIP or minified output without reviewable source. Keep tools, Markdown,
metadata, screenshots and unsupported source files outside `package/`.

All blocks must support small, medium and large layouts. Use accessible controls,
CSS theme tokens and relative local resources. Keep the default behavior useful
without a host connection. Declare only necessary external HTTPS API origins in
the manifest and explain them in the block README. Never include secrets.

### Required submission information

- A nonblank block name in `package/manifest.json` (`name`, 1–80 characters).
  This is also the catalog name; do not duplicate it in `metadata.json`.
- A useful description in `metadata.json` (`description`, 1–280 characters).
- The author's name and GitHub username/organization (`author.name` and `author.github`).
- Exactly three local screenshots in `metadata.screenshots`, ordered:
  1. **small:** 156 × 156 pixels;
  2. **medium:** 336 × 156 pixels;
  3. **large:** 336 × 336 pixels.

Capture the actual block at each layout at 1× pixel density, cropped to its bounds,
without browser chrome or extra borders. Do not resize one screenshot into three
images. Use PNG/JPEG/WebP files, at most 2 MiB each, under `screenshots/` outside
`package/`. Filenames may vary; array order determines which layout is expected.
CI checks presence, uniqueness, image signatures and pixel dimensions. Reviewers
must still verify that the images really show the submitted block.

The generator deliberately creates no fake screenshots. Follow its
`screenshots/README.md`; builds and checks fail until the three real images exist.

The authoring skill and SDK document separate editor entrypoints, string storage,
capability checks and `openEditor()`. Do not invent manifest permissions, direct
authenticated GraphQL calls, automatic retries or visitor-writable storage.

## Update a block

Keep its slug stable. **Do not bump versions in author PRs.** Leave `metadata.version`,
`version.txt`, `.release-please-manifest.json` and generated changelogs unchanged.
New blocks start at `0.0.0`; `npm run new` also registers the component in
`release-please-config.json`. Run `npm run sync:releases` after manually adding or
removing an entry. Do not remove historical versions from the release manifest or
reuse a withdrawn slug for a different block.

Use a Conventional Commit PR title and squash-merge it. `feat` produces a minor
release, `fix` a patch, and `feat!` / `BREAKING CHANGE:` a major. The first release
is always `1.0.0`. Configured documentation and maintenance changes also produce
releases, so metadata/screenshot corrections reach the public catalog through the
same reviewed release process, not by editing an old published entry.

```sh
git fetch origin main
npm run check:versions -- --base "$(git rev-parse origin/main)"
```

After merge, release-please opens a separate release PR for each changed block.
It updates the version files, release manifest and changelog together. Release PRs
must not add package code or other metadata changes. Review and merge that PR to
publish its tagged snapshot. Preview ZIPs in `dist/` are refreshed by local builds;
they are never uploaded by the release workflow.

Published ZIPs are immutable. CI refuses to replace an existing version with
different bytes. Publishing a new version does not automatically update users'
installed copies or their storage. Explain compatibility and any application-owned
storage migrations in the README.

To withdraw an entry, open an explicit removal PR. Removal from the current index
does not delete old release archives or revoke already installed copies. Security
incidents may require separate host-side action; contact maintainers privately.

## Reviews and licensing

Use English Conventional Commit/PR titles, for example:

```text
feat(blocks): add currency converter
fix(blocks): improve currency converter validation
```

By submitting, you agree to distribute your contribution under the repository's
MIT license. Confirm rights to all included images/fonts and retain required
notices. The maintainer review covers usefulness, accessibility, network access,
privacy and source changes. Green CI alone is not acceptance or a security audit.
