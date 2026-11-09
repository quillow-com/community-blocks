# Block contract

Only immediate directories under `blocks/` are catalog entries. Slugs are unique,
lowercase ASCII words separated by single hyphens, at most 64 characters.
`blocks/README.md` is intentionally ignored; symlink entries are rejected.

## Catalog metadata

`metadata.json` sits **beside**, never inside, `package/`:

```json
{
  "schemaVersion": 1,
  "slug": "my-widget",
  "version": "0.0.0",
  "description": "A concise explanation of the block.",
  "author": { "name": "Your name", "github": "your-handle" },
  "license": "MIT",
  "tags": ["utility"],
  "screenshots": [
    "screenshots/small.png",
    "screenshots/medium.png",
    "screenshots/large.png"
  ]
}
```

- All fields are required; unknown fields are rejected. The metadata file is at most 16 KiB.
- `slug` must match the directory. `version` is stable `X.Y.Z`, with each number at most 999999.
  New entries use the unpublished placeholder `0.0.0`. Release-please owns later
  versions; author PRs must not bump them. A sibling `version.txt` contains the
  same version plus a newline. Released versions also match the root manifest.
  `version.txt` and the generated `CHANGELOG.md` stay outside the ZIP.
- The block name is required in `package/manifest.json` (`name`, 1–80 Unicode
  characters, not blank). The catalog uses this name, not a second metadata field.
- Description and author are required. Description: 1–280 Unicode characters. Author name: 1–80. No leading/trailing
  whitespace or control characters. GitHub author is a username/organization, not a URL.
- `license` is `MIT` for this catalog. Tags: at most 8 unique lowercase names, up to 30 characters each.
- Screenshots: exactly **three distinct** local PNG/JPEG/WebP files under
  `screenshots/`, at most 2 MiB each. Array order is **small, medium, large**:

  | Array index | Layout | Required image dimensions |
  | ----------- | ------ | ------------------------- |
  | 0           | Small  | 156 × 156 pixels          |
  | 1           | Medium | 336 × 156 pixels          |
  | 2           | Large  | 336 × 336 pixels          |

  Capture the block at each layout at 1× pixel density, without extra UI or
  borders. Resizing a single capture is not a substitute for three layout
  screenshots. Filenames may vary; the dimensions must match each array slot.
  Checks read dimensions from image headers, accounting for JPEG EXIF rotation.
  Missing files, wrong sizes, unreadable dimensions, signature/extension mismatches
  and symlinks are rejected. Review still checks image content and rendering;
  header validation does not prove that an image depicts the submitted block.
  Screenshots are catalog assets, never widget ZIP assets.

- A nonempty, regular `README.md` (at most 64 KiB) explains behavior, external APIs,
  limitations, editor settings, browser checks and update compatibility.

## Upload package

`package/manifest.json` retains Quillow's existing **schemaVersion 1**. Catalog
versioning, authors, screenshots and tags do not belong in that manifest.

```json
{
  "schemaVersion": 1,
  "name": "My widget",
  "entrypoint": "index.html",
  "editor": { "entrypoint": "settings/editor.html" }
}
```

`editor` is optional. External APIs optionally use `network.allowedOrigins`, with
exact HTTPS origins and working target CORS. Storage needs no manifest permissions.

The pinned skills validator is the implementation source for archive validation.
Current limits:

| Item                                     |                Limit |
| ---------------------------------------- | -------------------: |
| Complete ZIP                             |               10 MiB |
| Total expanded bytes, including manifest |               30 MiB |
| Each file                                |               10 MiB |
| Manifest                                 |               16 KiB |
| Entries, including explicit directories  |                  100 |
| Package path                             | 240 ASCII characters |

Allowed extensions: `.html`, `.css`, `.js`, `.mjs`, `.png`, `.jpg`, `.jpeg`, `.webp`,
`.gif`, `.ico`, `.woff`, `.woff2`. The root `manifest.json` is the only JSON exception.
No standalone SVG, source maps, TypeScript, Markdown, package files, hidden paths,
symlinks, nested ZIPs or encrypted archives. `.DS_Store` files are omitted during
packaging, without changing the original input; uploaded archives containing them
are still invalid. Use local relative resource paths and correct filename case.

Both main and editor entrypoints share the archive limits. No outer `package/`
directory appears inside the ZIP. The backend remains authoritative: a valid
archive does not establish browser compatibility, resource references or security.

Required third-party license notices must travel with the ZIP: use appropriate
HTML/CSS/JS comments or a local `licenses.html`, not an unsupported `LICENSE.txt`
or a README outside the package. The starter embeds the SDK's MIT notice in its
generated `runtime.js`.
