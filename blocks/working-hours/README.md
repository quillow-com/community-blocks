# Working Hours

Business hours for cafes, restaurants and shops, with automatic **Open now / Closed now**
status. Configure weekly hours, split shifts, overnight service and special dates.

## Layouts and appearance

- **Small (156 × 156):** live status, next opening/closing, and the current or next
  interval today. A count indicates additional intervals later today.
- **Medium (336 × 156):** status on the left, the current/next interval and optional
  special-date label on the right, with the business time zone below.
- **Large (336 × 336):** title, status, this week's seven days with today highlighted,
  optional note, and time zone. Special dates replace their corresponding week rows.
  Long titles, notes and schedules with multiple shifts have keyboard-scrollable
  regions; the default one-interval week fits without scrolling.

Follows Quillow's light/dark theme, font and corner style. Status is conveyed with
text as well as a coloured dot. Public labels and settings are in English.

## Editor settings

Open Quillow's **Custom Block settings** gear to edit:

- **Title:** up to 80 characters; large layout only. Blank hides it.
- **Note:** optional, up to 160 characters; large layout only.
- **Business time zone:** a searchable dropdown with city names and IANA zone IDs,
  such as `Berlin · Europe/Berlin` or `New York · America/New_York`. Search by city
  or zone ID and select a result with the pointer or arrow keys and Enter. Escape
  cancels a search; typing alone does not change the selected zone. **Use my time
  zone** selects the owner's device zone. Valid saved aliases are preserved.
  Modern browsers provide their full IANA list; older browsers without zone-list
  support offer common zones plus the saved and device zones.
  **The default is UTC. Set the business's actual zone before publishing.**
- **Clock format:** 12- or 24-hour. This does not change the stored times.
- **Weekly hours:** all seven days remain visible. Day chips toggle working days;
  each day can be scheduled, open 24 hours, or closed. Up to three intervals per day.
  **Copy times to…** lets you explicitly select target days; closed days are not
  selected by default. Applying the copy replaces the selected days' draft hours.
- **Special dates:** up to 60 individual dates, each with an optional 60-character
  label and the same closed/24-hour/scheduled modes. Add each date of a multi-day
  vacation separately. Only one override per date is allowed.

Times are local to the business. An end before its start means the following day,
for example `18:00–02:00`. The editor explains this, and week rows use `+1`.
Equal start/end times are rejected; choose **Open 24 hours** instead. Overlapping
intervals, including weekly overnight overlaps with the next day, cannot be saved.
Touching intervals are continuous for status calculations.

**A special date replaces the whole calendar day**, including incoming hours from
the previous evening. A closed holiday starts at midnight even if the night before
normally ends at 02:00. A special date may itself have overnight hours; those carry
into the next day unless that next date has its own override.

Nothing is stored until **Save** is clicked. Settings are serialized JSON text in
the `settings` key. Public visitors can only read. Saves retain revision tokens;
conflicts or uncertain outcomes preserve the draft and lock further saving. Copy
needed edits and reopen settings to inspect the saved value before reconciling.
Writes are never retried automatically.

## Clock behavior

Status uses the visitor device's current clock, converted to the **business time
zone**, never the visitor's local zone. It refreshes at minute boundaries and when
the document becomes visible. An inaccurate device clock can give an inaccurate
status. Already-open pages do not subscribe to owner settings changes; reload to
read a newly saved schedule.

Daylight-saving transitions follow the browser's IANA rules. A missing local time
is shifted forward by the gap (`02:30` becomes `03:30` for a one-hour jump).
For repeated times, opening uses the first occurrence and closing the last.
An interval whose resolved end is not after its start has no opening that day.
24-hour days follow civil midnight boundaries, including 23/25-hour days.

No holiday calendar is downloaded: owners must enter and maintain their dates.
The default schedule is demonstration content, not a verified business listing.

## Network and privacy

No external API requests, analytics, remote images or author-added remote fonts.
The manifest grants no network origins. The bundled SDK **0.6.0** handles host
storage and theme/font integration. No browser storage or authenticated API calls.
The SDK's MIT notice is retained in `runtime.js` and `THIRD_PARTY_NOTICES`.

## Local preview and verification

Serve `package/` over local HTTP. Standalone the block shows its default hours
without reading or writing storage. Settings must be opened with a compatible
Quillow host; standalone settings honestly remain unavailable. A missing storage
capability, failed host connection, or malformed/unsupported saved settings shows
an unavailable state, never a fabricated live business status.

```sh
node --test blocks/working-hours/test/*.test.mjs
npm run check
npm run check:versions -- --base "$(git rev-parse HEAD)"
npm run build
```

Optional browser tests need an independently installed Playwright with browsers:

```sh
node blocks/working-hours/test/browser.mjs
# Or point PLAYWRIGHT_MODULE at an existing Playwright ESM entry.
# Add --screenshots to recapture the three catalog images in Chromium.
```

These runtime tests execute widget JavaScript and are deliberately separate from
PR validation and packaging. They use the documented opaque-origin iframe sandbox,
CSP and a scripted host with real SDK MessageChannels, not the live Quillow app.
Chromium, Firefox and WebKit checks cover all layouts, light/dark themes, live fonts,
dense content, keyboard focus, repeated saves and reopening, copying and holidays.
Additional Chromium cases cover read-only access, missing capabilities, malformed
storage, create-only writes, validation, revision conflicts, uncertain confirmations
without retry, unavailable hosts, narrow editor width and minute-boundary updates.
The time-zone picker is tested for city/zone search, keyboard and pointer selection,
cancelled/empty searches, save/reopen behavior and status changes in all three browsers.
Chromium also covers saved aliases, an older-browser zone-list fallback and touch
selection at a narrow editor width.
Pure tests cover midnight, split shifts, overnight carry, date overrides, long
closures, far-future exceptions, fractional offsets and daylight-saving changes.
See [screenshot provenance](screenshots/README.md). Live Quillow testing is still
needed; archive validation and code review do not prove widget safety.

## Updates and compatibility

New entry at unpublished `0.0.0`; release-please prepares the first `1.0.0` release.
Saved settings have `v: 1`. Unsupported versions are not loaded or overwritten.
No storage migration is currently needed. Publishing an update does not update
already installed ZIPs or their saved settings automatically.

## License

MIT. By [Ilya Suhodolskiy](https://github.com/suhodolskiy).
