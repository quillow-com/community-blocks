# Publication and catalog

## First-time maintainer setup

1. Push the initial repository to `quillow-com/community-blocks` on `main`.
2. Enable Actions and **Allow GitHub Actions to create and approve pull requests**
   in repository settings. The release job uses the built-in token with
   `contents`, `issues`, `pull-requests` and `actions: write`. No PAT, npm publishing
   or external storage credentials are needed. Automation never approves or merges PRs.
3. Protect `main`: require reviews and both **Check blocks** matrix checks. Prefer
   squash merges with English Conventional Commit titles. Configure CODEOWNERS
   with real maintainers, especially for `.github/`, `scripts/`, dependencies and
   release policy. No fictitious team or reviewer is preconfigured here.
4. Enable a private vulnerability reporting channel. Review `SECURITY.md`.
5. Run **Release blocks and catalog** on `main`, or merge the first community block.
   An empty registry publishes an empty catalog and skips release-please. Examples
   never become entries automatically.

PR checks run Node 22.20.0 and 24.15.0, install locked tooling with
`npm ci --ignore-scripts`, check formatting/runtime/release state, run tests and
validate each block. They have read-only permissions and no repository secrets.
Packaging never executes widget JavaScript or contributor build commands.

## Independent releases

Each `blocks/<slug>` is a release-please `simple` component. Root tooling,
`examples/` and `docs/` are not components. Run `npm run sync:releases` to regenerate
the component configuration; `npm run new` does this automatically.

1. Author PRs change static files and metadata but leave versions unchanged. New
   blocks start at unpublished `0.0.0`, without a root manifest entry.
2. After merge, release-please prepares a separate release PR for each affected
   block. The first release is `1.0.0`; later Conventional Commits determine the
   SemVer bump. `feat` is minor, `fix`/`perf` patch, and breaking changes major.
   Configured `docs`, `refactor` and `chore` changes also produce releases.
3. That PR updates `version.txt`, `metadata.json` (`$.version`), `CHANGELOG.md` and
   `.release-please-manifest.json` together. Checks reject code or unrelated
   metadata changes in a release PR. A maintainer reviews and merges it.
4. Release-please creates `<slug>-vX.Y.Z` and a draft GitHub release. Forced tag
   creation makes the source commit available even while the release is a draft.
5. The same workflow fetches those tags, reconstructs their static block files,
   validates the tagged version state and main ancestry, and packages only
   `blocks/<slug>/package/`. It never runs tooling or widget scripts from a tag.
6. Before publishing the draft, it attaches `<slug>-X.Y.Z.zip` and `block.json`.
   The record contains the commit-pinned catalog entry, source commit, archive
   SHA-256 and sizes. Metadata, version files, changelogs, README and screenshots
   stay outside the ZIP.
7. The catalog selects the highest complete, stable, published version of each
   active slug. Drafts, prereleases, incomplete releases and blocks with no release
   are excluded. Code, metadata and screenshots in unreleased `main` changes do
   not affect an existing catalog entry. Removal from `blocks/` withdraws a slug
   from the next catalog without deleting historical releases.

Events created with `GITHUB_TOKEN` do not trigger ordinary PR/tag/release workflows.
The release job therefore explicitly dispatches the read-only check workflow for
bot-created/updated PR branches, and packages releases in the same workflow that
created them. No `pull_request_target`, PAT or privileged PR execution is used.

## Local previews and tooling

`npm run build` writes `dist/catalog.json` with `channel: "preview"` and a ZIP per
community entry. Local preview files can be refreshed without bumping versions.
`npm run check:blocks` validates temporary archives without writing `dist/`.
Neither command publishes anything; publication does not read `dist/catalog.json`.

The packager/validator come from `@quillow/skills`, pinned to public commit
`8df2eb7c0b49e286ede92024fb093c07f53b3d1c` through an integrity-locked tarball.
Release-please is pinned to 17.3.0; offline tests exercise its actual manifest and
JSON version updaters. A scoped `minimatch: 11.0.1` override fixes
GHSA-g3hv-75wg-m249 in local release-please tooling; the git-file-utils glob API is
covered by a compatibility test. The separately pinned action bundles upstream
dependencies; npm overrides do not alter it. This configuration uses fixed file
paths, not contributor-supplied glob patterns.

Publication pins Node 24.15.0 and `TZ=UTC`. Review tooling upgrades explicitly.
Old published ZIPs are read and validated, not routinely rebuilt by new tooling.
If a deliberate retry generates different bytes, publish a larger version rather
than replacing the old asset.

## Immutability, retries and catalog promotion

- The workflow runs only on upstream `main` after merge or manual dispatch. It
  requires a clean committed checkout at the current upstream SHA. Forks run checks.
- Candidate tags, source commits, archives and existing assets are checked before
  uploads. Existing bytes are downloaded with size bounds and compared by SHA-256.
  Matching assets are reused; different bytes fail. Assets are never deleted/replaced.
- Interrupted block drafts are recovered automatically even without new
  release-please outputs. Only missing draft assets are attached. A published
  version missing assets is skipped by catalog collection, never silently repaired.
- To retry a specific version, manually dispatch **Release blocks and catalog** on
  `main` with its optional `tag` input, or use
  `npm run publish:catalog -- --tag my-widget-v1.0.0` in a clean main checkout with
  fetched tags and an authorized token. Do not create tags or publish drafts by hand.
- The released catalog has a content-addressed tag `catalog-<SHA256-of-catalog.json>`.
  Unreleased changes and unrelated main commits do not create new catalog content.
  Only catalog releases are marked **latest**; individual blocks explicitly are not.
- Catalog publication is last. An upload failure leaves the previous catalog usable;
  a superseded main run does not promote a stale index. Historical catalogs and
  block ZIPs remain addressable by tag.

Prefer GitHub immutable release protection as an additional safeguard. Review root
scripts and dependency/workflow changes carefully: after merge they execute with
the release job's write token. Workflows do not configure repository settings for you.

## Repository rename

The canonical repository is `quillow-com/community-blocks`. Releases published
before the rename retain `quillow-com/custom-blocks` in their immutable `block.json`
and catalog assets. Do not replace those assets or bump a block version just to
change repository URLs.

The publisher accepts only these two exact repository identities. It validates
each historical record's original URLs, tag, source commit, archive size and
SHA-256 before producing a new catalog with canonical `community-blocks` URLs.
Explicit retries preserve existing record bytes, including records on interrupted
draft releases. ZIP bytes, versions and source commits do not change.

After renaming the repository in GitHub:

1. Update local `origin` URLs and publish the prepared changes to upstream `main`.
2. Run **Release blocks and catalog** on the renamed repository. This publishes a
   new content-addressed catalog from the existing releases; old snapshots remain.
3. Deploy the updated Worker explicitly, then rebuild/deploy the consuming app.
   The Worker fetches the new upstream URL; its domain does not change. Both the
   updated Worker and frontend accept an unchanged legacy catalog during migration.

Do not create a new repository at the old name: GitHub's existing redirects must
continue pointing to this repository. Historical changelogs do not need rewriting.

## Catalog format

`schemaVersion: 1` wraps `repository`, `channel: "released"` and sorted `blocks`.
Each entry includes slug, stable version, its own `sourceCommit`, manifest name,
description, author, license, tags, commit-pinned source/screenshot URLs, normalized
manifest, editor availability, network origins, release tag, ZIP filename/URL,
SHA-256 and ZIP/expanded sizes. An entry's source commit is its tagged release
snapshot, not the current main commit. The public URL is:

```text
https://github.com/quillow-com/community-blocks/releases/latest/download/catalog.json
```

Every entry has a name, description, author name/GitHub username, and exactly three
commit-pinned screenshot URLs, ordered small (156 × 156), medium (336 × 156), large
(336 × 336). Source validation checks image headers and dimensions before packaging;
screenshots are never included in the widget ZIP.

Descriptions and metadata are untrusted display text: gallery clients must escape
them. Download URLs are generated for this repository, never supplied by authors.
A future Quillow gallery must validate size, digest, archive structure and
authorization independently. Updates remain explicit and never replace installed
widgets or their storage automatically. Do not assume GitHub URLs support browser
CORS; an app backend should fetch/cache the index or mirror reviewed artifacts.
