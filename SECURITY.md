# Security

Community widgets are untrusted browser code, even after review. ZIP validation
does not prove that a block is safe, usable or correct.

- Quillow's iframe isolation, CSP, capability checks and backend authorization
  remain authoritative. Never share privileged-origin credentials with widgets.
- Editor HTML is publicly addressable, not an authentication boundary. Do not
  include secrets in code, assets, block storage, screenshots or metadata.
- PR checks run without secrets and with read-only token permissions. Do not use
  `pull_request_target` to check out and execute a contributor's branch.
- Packaging reads static files. It does not execute per-widget scripts, install
  widget dependencies or run submitted JavaScript.
- Publishing runs only from a clean checkout of the current upstream `main`.
  ZIP inputs are reconstructed from approved release tags without running tagged
  tooling. The public catalog reads published snapshots, not unreleased block files.
  A review of workflows, root scripts and dependency changes is especially important:
  after merge those files execute in a release job with write permissions.
- Releases and SHA-256 checks make substitution detectable, not code trustworthy.
  Maintainers must not manually replace assets. Prefer GitHub immutable release
  protection when available for this repository.

Do not disclose exploitable secrets or security vulnerabilities in public issues
or PRs. Use GitHub's private vulnerability reporting when enabled, or contact the
Quillow maintainers privately. Maintainers must enable and document a working
private reporting channel before opening the repository broadly to submissions.
