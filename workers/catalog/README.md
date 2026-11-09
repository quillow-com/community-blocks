# Community catalog Worker

Public, read-only Cloudflare Worker for the released community catalog. It lives
beside the catalog contract and publisher, not in the consuming Quillow app.
It never reads block source files or executes block code.

## Contract

- `GET /catalog.json`: fetch the fixed GitHub `releases/latest/download/catalog.json`
  URL, validate the released envelope/entries and return JSON.
- `HEAD /catalog.json`: the same headers without a body.
- `OPTIONS /catalog.json`: public CORS preflight for GET/HEAD. No credentials.
- Other paths, methods and all query parameters are rejected. This is not an open proxy.
- Redirects are limited to this repository's content-addressed catalog releases and
  GitHub's HTTPS asset hosts. Client cookies, tokens and headers are never forwarded.
- The entire upstream request/redirect/body read has a 10-second deadline and a
  5 MiB response limit. Only `schemaVersion: 1`, `channel: "released"` from
  `quillow-com/custom-blocks` is served. Draft/preview catalogs are rejected.
- Valid responses use Cloudflare Cache API for 5 minutes; browser caching is
  limited to 60 seconds. ETags support conditional requests. Errors are never cached.
- CORS is `*` intentionally: the catalog is public and requests are credentialless.
  CORS is not authorization. No GitHub token, R2, KV or backend change is needed.

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
