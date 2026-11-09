# Crypto Price · CoinPaprika

A responsive cryptocurrency price block by [Ilya Suhodolskiy](https://github.com/suhodolskiy).
Displays a selected coin's price, 24-hour percentage and absolute change, market
capitalization and trading volume. An optional chart shows hourly price samples
from the last 24 hours. This is market information, not financial advice.

Adapted from the author's `Quillow-Crypto-CoinPaprika-Clean-v6.zip` submission.
The archive's `v6` is a development filename, not a catalog release version. This
new entry starts at unpublished `0.0.0`; release-please prepares its first `1.0.0`.

## Layouts and appearance

- **Small (156 × 156):** coin symbol, price and 24-hour change.
- **Medium (336 × 156):** coin identity, price, change and optional compact chart.
- **Large (336 × 336):** chart plus volume, market cap and sampled high/low values.

Uses Quillow's official theme/layout SDK 0.6.0, host font, surface/text/accent tokens,
and light/dark themes. Without layout context, media queries select the compact
layouts. Reduced-motion preferences disable skeleton animation and transitions.
Controls have visible keyboard focus; loading/error messages are announced.

The SDK replaces the submission's custom compatibility bridge. The packaged
`runtime.js` is the pinned official ESM bundle with its MIT license notice, not a
second implementation of the host protocol.

## Configure the pair

Open **Config** using the block settings gear. In an interactive owner view,
**Choose pair** also asks the host to open the editor when that capability exists.
The Quillow editor grid may disable iframe pointer events for dragging; use the
settings gear there.

Supported coins: BTC, ETH, SOL, DOGE, ADA, XRP, LTC, AVAX, DOT and LINK.
Quote currencies: USD, EUR, GBP, JPY, AUD and CAD. Availability depends on the
provider; an unavailable response is shown as an error, not fabricated data.

Settings use the block's `crypto.settings` storage key. The value is explicitly
serialized JSON text, for example `{"base":"BTC","quote":"USD"}`. The editor
reads the entry before saving and passes its returned revision to conditional
updates. A missing entry uses create-only storage, without an invented revision.

Public sessions cannot save settings or open Config. Without valid saved
settings, owners see a setup prompt and visitors see **Not configured**. Failed
or uncertain writes disable Save until an explicit reload; there is no automatic
overwrite or mutation retry. Closing Config refreshes the host preview so it can
read the saved pair. No storage migration is needed for this first release.

## Network, privacy and limitations

The manifest allows only **`https://api.coinpaprika.com`**:

- `GET /v1/tickers/<coin-id>?quotes=<currency>` for the current quote;
- `GET /v1/tickers/<coin-id>/historical` with start/interval/quote parameters for
  optional hourly history.

Requests omit credentials. No API key, wallet address, account token or analytics
is embedded. CoinPaprika still receives ordinary network information, including
the requester IP and selected market. No other API provider is used.

Quotes refresh approximately every two minutes while the page is visible.
Requests in flight are cancelled on a new refresh or page teardown. Provider
quotas, supported currencies, pricing, API availability and browser CORS behavior
can change. The block does not circumvent access limits or supply paid API credentials.

History failures do not hide a valid quote: the chart reports **24h history
unavailable**, and high/low remain unavailable. When history exists, high/low are
the extrema of returned hourly samples, not exchange OHLC values. The small
layout deliberately hides the chart and detailed metrics. Initial quote errors
show **Price unavailable**; a later failure marks the last received price **STALE**.
The block never fills failed requests with invented prices or historical values.

## Local preview and checks

Serve `package/` over local HTTP. A standalone preview displays BTC/USD from the
real API without connecting to Quillow Storage or writing settings. Embedded
views require the host's v1 storage connection and read capability; editing also
requires owner mode and write capability.

The submitted screenshots show three separate rendered layouts, not resized
copies. See [screenshot details](screenshots/README.md).

Before submitting:

```sh
npm run check
npm run check:versions -- --base "$(git rev-parse origin/main)"
npm run build
```

Local browser checks passed in Chromium, Firefox and WebKit for all three sizes.
The Chromium checks also covered light/dark themes, reduced motion, keyboard
focus, initial quote errors, optional-history failures, stale quotes, empty and
invalid saved settings, missing capabilities, revision-checked saves, create-only
storage, conflicts, uncertain writes and public read-only behavior.

Screenshots used real browser requests to CoinPaprika (quote HTTP 200, history
HTTP 402). Failure-path and chart tests used isolated mock responses. The parent
was a local cross-origin SDK host-contract harness, not the actual Quillow app.
The real application settings modal, host authorization and production persistence
still need an integration check. Archive validation and these local checks do not
establish security or guarantee future API availability.

## License

MIT, as a contribution to this repository; the block's license notice is retained
in `package/app.js`. SDK redistribution notices are retained in
`THIRD_PARTY_NOTICES` and in the packaged runtime. Coin names and symbols identify
the supported markets; no external logo images or custom fonts are bundled.
