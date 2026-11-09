# Repository instructions

- Community entries live only in `blocks/<slug>/`. `examples/` and `docs/` are not catalog entries.
- Every block needs a manifest name, metadata description/author, and exactly three real screenshots: small 156×156, medium 336×156, large 336×336, in that array order. Keep screenshots outside the ZIP; do not generate fake images in the scaffold.
- Only `package/` is archived. Never include metadata, screenshots, README files, source maps or npm manifests in a widget ZIP.
- Use the pinned `@quillow/skills` archive tools. Do not fork or weaken their validation rules.
- Do not execute contributor-provided build scripts or widget JavaScript during packaging.
- Run `npm run check` and, for existing blocks, `npm run check:versions -- --base <base-commit>`.
- Published ZIPs are immutable. Author PRs leave versions unchanged; release-please bumps each block in a separate release PR. Never replace release assets.
- New blocks start at 0.0.0; run `npm run sync:releases` after adding/removing entries. Keep metadata.version, version.txt and the release manifest synchronized.
- Package only tagged static snapshots for publication. Build the public catalog from released block.json/ZIP assets, never unreleased main files.
- The read-only Cloudflare endpoint lives in workers/catalog/. It serves only the fixed released catalog; never turn it into an arbitrary URL proxy. Its deployment is explicit and separate from block releases.
- PR workflows must have no secrets or write permissions. Do not use `pull_request_target` to run contributor code.
- Keep SDK and host security boundaries intact. Do not promise that code review or archive validation proves a widget safe.
- Use English Conventional Commit titles, such as `feat(blocks): add weather widget`.
- Do not commit or push unless requested.
