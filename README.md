# Quillow community blocks

Community-built Custom Blocks for Quillow. Submit readable static widget files
through a pull request; GitHub Actions validates them and publishes upload-ready
ZIPs after review and a separate release PR. Users do not need a build tool to install a block.

## Install a block

1. Choose a released block from the catalog or [Releases](https://github.com/quillow-com/community-blocks/releases). Files in `blocks/` may contain unreleased changes.
2. Download that block's versioned `.zip` release asset.
3. Upload the ZIP through Quillow's Custom Code control.

The machine-readable catalog is available after the first successful publication:

```text
https://github.com/quillow-com/community-blocks/releases/latest/download/catalog.json
```

There are no published community entries yet. [`examples/hello-world/`](examples/hello-world/)
is a development example, not a catalog entry. This repository does not yet provide
a gallery website or one-click installation inside Quillow.

## Create a block

Requires Node.js **22.20+** (Node 24 recommended), npm and Git.

```sh
npm ci --ignore-scripts
npm run new -- my-widget --author your-github-handle
# Customize the block and add its three real screenshots before checking/building.
npm run format
npm run check
npm run build
```

Customize the new files before submitting. The resulting ZIP is
`dist/my-widget-0.0.0.zip` for a new block. This is a local preview, not a published
version. Leave version files unchanged: release-please prepares the first `1.0.0`
release and subsequent independent SemVer bumps. Serve its `package/` directory over local HTTP to develop
it, and test it in Quillow before submission. The example's local button works in
a standalone preview; editor-grid interaction depends on Quillow's host behavior.

```text
community-blocks/
├── blocks/                    # Only these entries enter the catalog
│   └── <slug>/
│       ├── metadata.json
│       ├── version.txt         # Maintained by release-please
│       ├── CHANGELOG.md        # Created on the first release PR
│       ├── README.md
│       ├── screenshots/       # Outside the ZIP
│       └── package/           # Entire ZIP input
│           ├── manifest.json
│           ├── index.html
│           └── ...
├── examples/                  # Learning material, not published blocks
├── docs/
├── scripts/
├── tests/
└── .github/workflows/
```

**Only `blocks/<slug>/package/` is archived.** Metadata, README files, screenshots,
examples and documentation never enter a widget ZIP.

Every submission requires:

- **Name:** `name` in `package/manifest.json` (1–80 characters).
- **Description:** `description` in `metadata.json` (1–280 characters).
- **Author:** `author.name` and `author.github` in `metadata.json`.
- **Three real screenshots:** small **156 × 156**, medium **336 × 156**, large
  **336 × 336** pixels, in that order in `metadata.screenshots`. PNG/JPEG/WebP,
  at most 2 MiB each, under `screenshots/` and outside the ZIP.

The generator supplies paths and capture instructions, not placeholder images.
Capture each layout at 1× pixel density; checks read image dimensions from the
files and fail on missing images or incorrect sizes. Do not just resize one image
to all three sizes. See [the block contract](docs/block-contract.md).

## Contribute and maintain

- [Contribution guide](CONTRIBUTING.md)
- [Metadata and package contract](docs/block-contract.md)
- [Releases, catalog format and first-time setup](docs/publication.md)
- [Cloudflare catalog/ZIP endpoints and deployment](workers/catalog/README.md)
- [Security model](SECURITY.md)
- [Authoring skill](https://github.com/quillow-com/skills)
- [Custom Block SDK](https://github.com/quillow-com/custom-block-sdk)

Checks use the existing skills packager/validator, pinned to an immutable commit
in `package.json` and verified by `package-lock.json`. There are no per-block npm
installs or author-defined build commands. The starter includes the released SDK
0.6.0, with its MIT notice. Use `npm run sync:runtime` only when deliberately
updating the example; existing community packages are not silently rewritten.

Maintainers must configure required reviews and checks before accepting submissions.
After author changes reach upstream `main`, release-please opens a release PR for
each changed block. Merging that PR publishes ZIPs from immutable tags. The public
catalog uses released snapshots only; unreleased changes in `main` cannot alter it.
PR checks have read-only permissions, no repository secrets, and no widget execution.

## License

Repository code and community submissions use [MIT](LICENSE). Contributors must
have redistribution rights for their code and assets and retain required third-party
notices. Attribution is included in each block's metadata.
