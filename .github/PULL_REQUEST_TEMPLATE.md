## Block

- Slug:
- Block name:
- Description:
- Author name and GitHub username:
- New block / update / withdrawal:
- What does it do?

## Review checklist

- [ ] Only upload-ready static files are in `package/`; no ZIPs, npm manifests, source maps or secrets.
- [ ] Metadata, author attribution, MIT licensing and any asset licenses are correct.
- [ ] `package/manifest.json` has a block name; `metadata.json` has a description and author name/GitHub username.
- [ ] Author PR: version files are unchanged (new blocks use `0.0.0`); the PR title is a Conventional Commit.
- [ ] New/removed entries are reflected in `release-please-config.json` (`npm run sync:releases`).
- [ ] I ran `npm run format`, `npm run check` and `npm run build`.
- [ ] I tested 156 × 156, 336 × 156 and 336 × 336 layouts, keyboard navigation and reduced motion.
- [ ] I tested the block inside Quillow (including any editor page and storage behavior), or clearly describe what was not tested below.
- [ ] Network origins are necessary and documented. No private keys, tokens, analytics or visitor data are embedded.
- [ ] I included exactly three real screenshots in `metadata.screenshots`: small 156 × 156, medium 336 × 156, large 336 × 336 pixels, in that order.
- [ ] Screenshots capture each actual layout at 1× density (not one resized image), are PNG/JPEG/WebP, at most 2 MiB each, and stay outside `package/`.

## Screenshots / runtime checks / limitations

Archive validation is not proof of browser behavior or security. Describe actual checks here.
