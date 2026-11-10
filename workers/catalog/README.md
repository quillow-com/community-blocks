# Community catalog Worker

Public, read-only Cloudflare Worker for the released community catalog. It lives
beside the catalog contract and publisher, not in the consuming Quillow app.
It never unpacks archives or executes block code.

## Contract

- `GET /catalog.json`: fetch the fixed GitHub `releases/latest/download/catalog.json`
  URL, validate the released envelope/entries and return JSON.
- `HEAD /catalog.json`: the same headers without a body.
- `GET /blocks/<slug>/<version>.zip`: return the exact ZIP listed in the current
  released catalog. For example: `/blocks/crypto-coinpaprika/1.0.0.zip`.
- `HEAD /blocks/<slug>/<version>.zip`: verify/resolve the same ZIP, without a body.
  A cold HEAD request still downloads and verifies the ZIP before caching it.
- `OPTIONS` on either endpoint: public CORS preflight for GET/HEAD. No credentials.
- Other paths, methods and all query parameters are rejected. This is not an open proxy.
- Redirects are limited to this repository's content-addressed catalog releases and
  GitHub's HTTPS asset hosts. ZIP redirects cannot select another block/version or
  another repository. Client cookies, tokens and headers are never forwarded.
- Each request has one 10-second deadline for catalog lookup, redirects, body reads
  and integrity checks. Catalogs are limited to 5 MiB; ZIPs to 10 MiB, matching the
  Custom Block upload limit. Only `schemaVersion: 1`, `channel: "released"` from
  `quillow-com/custom-blocks` is served. Draft/preview catalogs are rejected.
- Download metadata is validated: `downloadUrl` must be the canonical GitHub release
  URL for that slug/version; `filename` and `releaseTag` must agree. The ZIP's actual
  byte count must match `zipBytes`, its SHA-256 must match `sha256`, and its first
  bytes must be a ZIP local-file header. No bytes are served or cached before these
  checks pass. A checksum/signature check does not prove a block is safe; the upload
  API must still perform its full archive validation before applying the block.
- Valid responses use Cloudflare Cache API for 5 minutes; browser caching is
  limited to 60 seconds. ETags support conditional requests. ZIP ETags are their
  verified SHA-256. ZIP responses use `application/zip` and an attachment filename;
  CORS exposes `Content-Disposition` for browser consumers. Errors are never cached.
- ZIP cache keys include the catalog checksum and byte count. Current catalog
  membership is checked before reading a cached ZIP or answering a conditional
  request. Withdrawn/unlisted versions return 404 after catalog cache expiry;
  already cached browser responses can remain fresh for another 60 seconds.
  Historical versions not listed in the current catalog are not served here.
- CORS is `*` intentionally: the catalog is public and requests are credentialless.
  CORS is not authorization. No GitHub token, R2, KV or backend change is needed.

The catalog JSON and its GitHub `downloadUrl` fields are not rewritten. Browser
consumers should use this Worker's origin plus `/blocks/<slug>/<version>.zip` to
fetch a listed ZIP without GitHub Releases CORS restrictions. For example:

```js
const url = new URL(
  `/blocks/${block.slug}/${block.version}.zip`,
  catalogEndpoint
)
const response = await fetch(url, {
  credentials: 'omit',
  redirect: 'error',
  signal,
})
if (!response.ok) throw new Error('Unable to download community block')
// Read a bounded body and verify block.sha256 before constructing a File
// for the existing authenticated Custom Block ZIP upload flow.
```

Consumers should also bound the download, verify the catalog checksum and support
request cancellation. This Worker does not install blocks, call the upload API or
automatically update installed versions. An upstream/integrity error returns a
retryable 502/504; an unknown slug/version returns 404. Errors include public CORS
headers and `Cache-Control: no-store`; HEAD errors are bodyless too.

Cache API entries are local to a Cloudflare data center and may be evicted. There
is no persistent mirror or stale-if-error fallback: on a cold-cache GitHub failure
the endpoint returns a retryable 502/504. Cache API does not implement the
`stale-while-revalidate`/`stale-if-error` directives. Use a custom domain for
production and verify caching there; local/preview behavior is not a CDN guarantee.

## Local checks

Worker deployment dependencies are isolated from repository packaging tooling:

```sh
npm --prefix workers/catalog ci --ignore-scripts
npm --prefix workers/catalog test
npm --prefix workers/catalog run build
npm --prefix workers/catalog run dev
```

`build` is a dry run and does not upload or create Cloudflare resources. Tests use
Node's test runner with isolated HTTP/cache doubles; they need no Cloudflare login
and never call the real upstream. The root `npm test` includes these tests.
Wrangler serves the local endpoint at `http://localhost:8787/catalog.json`.

## Deploy explicitly

After selecting the correct Cloudflare account:

```sh
npm --prefix workers/catalog exec -- wrangler login
npm --prefix workers/catalog run deploy
```

For `community-blocks.quillow.com`, add a custom-domain route in
`wrangler.jsonc` and disable `workers_dev`. The zone must be in the intended
Cloudflare account. Deployment and DNS changes are not performed by tests or
the block-release workflow. No production account/zone ID is checked into config.

Configure the consuming app's build-time `VITE_COMMUNITY_BLOCKS_CATALOG_URL` to
the deployed HTTPS `/catalog.json` endpoint (custom domain or workers.dev URL).
For local app development, set it to `http://localhost:8787/catalog.json`.
Keep Cloudflare deployment credentials only in Wrangler's login or a secret store,
never in any `VITE_` variable.
