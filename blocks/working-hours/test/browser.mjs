// Optional runtime checks. Not imported by packaging or PR checks.
// PLAYWRIGHT_MODULE may name an existing Playwright ESM entry; no block installs run.
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clone, DEFAULTS } from '../package/settings.mjs'

const playwright = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const packageRoot = fileURLToPath(new URL('../package/', import.meta.url))
const screenshots = fileURLToPath(new URL('../screenshots/', import.meta.url))
const capture = process.argv.includes('--screenshots')
const layouts = [
  { name: 'small', size: '1:1', width: 156, height: 156 },
  { name: 'medium', size: '2:1', width: 336, height: 156 },
  { name: 'large', size: '2:2', width: 336, height: 336 },
]

function host() {
  const options = window.fixture
  const frame = document.createElement('iframe')
  frame.title = 'Working Hours test fixture'
  frame.setAttribute(
    'sandbox',
    'allow-scripts allow-top-navigation-by-user-activation'
  )
  frame.referrerPolicy = 'no-referrer'
  frame.style.cssText = 'display:block;border:0;width:336px;height:336px'
  document.body.style.margin = '0'
  const protocol = 'quillow:custom-block'
  const envelope = (type, data = {}) => ({
    protocol,
    version: 1,
    type,
    ...data,
  })
  let entry =
    options.saved === null
      ? null
      : {
          key: 'settings',
          value: options.saved,
          revision: 'r1',
          createdAt: '2026-11-12T10:00:00Z',
          updatedAt: '2026-11-12T10:00:00Z',
        }
  let revision = 1
  let layout = { size: '2:2', width: 336, height: 336, viewport: 'desktop' }
  let dark = false
  let font = 'system-ui, sans-serif'
  const mode = options.public ? 'public' : 'editor'
  const capabilities = options.denied
    ? []
    : ['storage.get', ...(options.readOnly ? [] : ['storage.set'])]
  window.rpc = []
  window.getEntry = () => entry
  const sendContext = () =>
    frame.contentWindow?.postMessage(
      envelope('context', {
        context: {
          theme: {
            mode: dark ? 'dark' : 'light',
            cornerStyle: 'Normal',
            fontStylesheet: null,
            variables: {
              '--quillow-text-color': dark ? '#f3f4f6' : '#0d0d12',
              '--quillow-surface-color': dark ? '#17191f' : '#ffffff',
              '--quillow-accent-color': '#7f51f2',
              '--quillow-accent-text-color': '#ffffff',
              '--quillow-radius': '12px',
              '--quillow-typography': font,
            },
          },
          layout,
          environment: mode === 'editor' ? 'editor' : 'published',
        },
      }),
      '*'
    )
  window.setLayout = (value, theme = false, nextFont = font) => {
    layout = { ...value, viewport: 'desktop' }
    dark = theme
    font = nextFont
    frame.style.width = `${value.width}px`
    frame.style.height = `${value.height}px`
    sendContext()
  }
  const sessions = new Set()
  window.addEventListener('message', (event) => {
    if (event.source !== frame.contentWindow || event.origin !== 'null') return
    const data = event.data
    if (data?.protocol !== protocol || data.version !== 1) return
    if (data.type === 'ready') {
      sendContext()
      return
    }
    if (
      options.absent ||
      data.type !== 'connect' ||
      sessions.has(data.connectionId)
    )
      return
    sessions.add(data.connectionId)
    const channel = new MessageChannel()
    const message = (type, extra) =>
      envelope(type, { connectionId: data.connectionId, ...extra })
    channel.port1.onmessage = ({ data: request }) => {
      if (request.type === 'disconnect') {
        channel.port1.close()
        return
      }
      if (request.type === 'ping') {
        channel.port1.postMessage(
          message('pong', { requestId: request.requestId })
        )
        return
      }
      if (request.type !== 'request') return
      window.rpc.push({ method: request.method, params: request.params })
      const reply = (result) =>
        channel.port1.postMessage(
          message('response', {
            requestId: request.requestId,
            ok: true,
            result,
          })
        )
      const fail = (code) =>
        channel.port1.postMessage(
          message('response', {
            requestId: request.requestId,
            ok: false,
            error: { code, message: code },
          })
        )
      if (request.method === 'storage.get') {
        reply(entry)
        return
      }
      if (
        request.method !== 'storage.set' ||
        mode !== 'editor' ||
        options.readOnly
      ) {
        fail('PERMISSION_DENIED')
        return
      }
      if (options.conflict) {
        fail('widget_storage_conflict')
        return
      }
      if (options.uncertain) {
        reply(null)
        return
      }
      if (
        typeof request.params.value !== 'string' ||
        (entry && request.params.expectedRevision !== entry.revision)
      ) {
        fail('widget_storage_conflict')
        return
      }
      entry = {
        key: 'settings',
        value: request.params.value,
        revision: `r${++revision}`,
        createdAt: '2026-11-12T10:00:00Z',
        updatedAt: '2026-11-12T10:30:00Z',
      }
      reply(entry)
    }
    channel.port1.start()
    frame.contentWindow.postMessage(
      message('connected', {
        context: {
          blockId: 'test-hours',
          versionId: 'test-v1',
          mode,
          capabilities,
        },
      }),
      '*',
      [channel.port2]
    )
  })
  window.remount = (editor) => {
    frame.src = `/package/${editor ? 'settings/editor.html' : 'index.html'}`
  }
  document.body.append(frame)
  window.remount(options.editor)
}

const files = new Map()
for (const entry of await readdir(packageRoot, {
  recursive: true,
  withFileTypes: true,
})) {
  if (entry.isFile()) {
    const filename = path.join(entry.parentPath, entry.name)
    files.set(
      `/package/${path.relative(packageRoot, filename).split(path.sep).join('/')}`,
      await readFile(filename)
    )
  }
}
let origin
const server = createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(
      `<!doctype html><html><head><meta charset="utf-8"></head><body><script>(${host.toString()})()</script></body></html>`
    )
    return
  }
  const file = files.get(req.url)
  if (!file) {
    res.writeHead(404)
    res.end()
    return
  }
  const prefix = `${origin}/package/`
  res.writeHead(200, {
    'Content-Type':
      {
        '.html': 'text/html',
        '.mjs': 'text/javascript',
        '.js': 'text/javascript',
        '.css': 'text/css',
      }[path.extname(req.url)] || 'application/octet-stream',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': [
      'sandbox allow-scripts allow-top-navigation-by-user-activation',
      "default-src 'none'",
      `script-src 'unsafe-inline' ${prefix}`,
      `style-src 'unsafe-inline' ${prefix} https://fonts.googleapis.com`,
      `img-src data: ${prefix}`,
      `font-src ${prefix} https://fonts.gstatic.com`,
      "connect-src 'none'",
      "worker-src 'none'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      'frame-ancestors https: http://localhost:* http://127.0.0.1:*',
    ].join('; '),
  })
  res.end(file)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
origin = `http://127.0.0.1:${server.address().port}`

async function session(browser, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 900, height: 800 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    timezoneId: 'Pacific/Honolulu',
    hasTouch: Boolean(options.touch),
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /Content Security Policy|Refused to|CORS/.test(message.text())
    )
      errors.push(message.text())
  })
  await page.addInitScript(
    (fixture) => {
      window.fixture = fixture
      if (fixture.noZoneList) Intl.supportedValuesOf = undefined
    },
    { saved: JSON.stringify(DEFAULTS), ...options }
  )
  await page.clock.install({ time: new Date('2026-11-12T10:30:00Z') })
  await page.goto(origin)
  const frame = page.frameLocator('iframe')
  if (options.editor)
    await frame.locator('.form-fields, .status.is-error').waitFor()
  else await frame.locator('body[data-ready]').waitFor()
  return { page, frame, context, errors }
}

async function finish(s) {
  assert.deepEqual(s.errors, [])
  await s.context.close()
}
async function save(s) {
  await s.frame.getByRole('button', { name: 'Save', exact: true }).click()
  await s.frame.locator('.status').filter({ hasText: 'Saved.' }).waitFor()
}
async function layout(s, value, dark = false, font = 'system-ui, sans-serif') {
  await s.page.evaluate(
    ({ value, dark, font }) => window.setLayout(value, dark, font),
    { value, dark, font }
  )
  await s.frame.locator(`#hours[data-size="${value.size}"]`).waitFor()
  await s.frame
    .locator(`html[data-quillow-theme="${dark ? 'dark' : 'light'}"]`)
    .waitFor()
  assert.equal(
    await s.frame
      .locator('#hours')
      .evaluate(
        (node) =>
          node.scrollWidth <= node.clientWidth &&
          node.scrollHeight <= node.clientHeight
      ),
    true,
    `${value.name} overflow`
  )
  if (value.size !== '2:2')
    assert.equal(
      await s.frame.locator('#hours').evaluate(() =>
        [...document.querySelectorAll('.summary, .today, .zone')].every(
          (node) => {
            const r = node.getBoundingClientRect()
            return (
              r.top >= 0 &&
              r.left >= 0 &&
              r.right <= innerWidth &&
              r.bottom <= innerHeight &&
              node.scrollHeight <= node.clientHeight
            )
          }
        )
      ),
      true,
      `${value.name} content bounds`
    )
}

try {
  for (const name of (process.env.BROWSERS || 'chromium,firefox,webkit').split(
    ','
  )) {
    const browser = await playwright[name].launch({ headless: true })
    try {
      const s = await session(browser, { saved: null })
      assert.equal(
        await s.frame.locator('.status-line').textContent(),
        'Open now'
      )
      assert.equal(
        await s.frame.locator('.next-change').textContent(),
        'Closes at 18:00'
      )
      for (const value of layouts) {
        await layout(s, value)
        if (value.size === '2:2')
          assert.equal(
            await s.frame
              .locator('.week')
              .evaluate((node) => node.scrollHeight <= node.clientHeight),
            true,
            'Default week must fit all seven days'
          )
        if (capture && name === 'chromium')
          await s.page
            .locator('iframe')
            .screenshot({ path: path.join(screenshots, `${value.name}.png`) })
        await layout(s, value, true, 'Georgia, serif')
      }
      assert.equal(
        (await s.page.evaluate(() => window.rpc)).some(
          (call) => call.method === 'storage.set'
        ),
        false
      )
      await finish(s)

      const dense = clone(DEFAULTS)
      dense.title =
        'A long business name with working hours and evening service'.slice(
          0,
          80
        )
      dense.note =
        'The kitchen closes thirty minutes before the restaurant. Please call ahead for holiday service and reservations.'
      dense.timeFormat = '12'
      dense.timeZone = 'America/Argentina/Buenos_Aires'
      dense.week = dense.week.map(() => ({
        mode: 'hours',
        intervals: [
          { start: '07:00', end: '10:00' },
          { start: '12:00', end: '14:00' },
          { start: '18:00', end: '23:00' },
        ],
      }))
      const packed = await session(browser, { saved: JSON.stringify(dense) })
      for (const value of layouts) await layout(packed, value)
      await finish(packed)

      const editor = await session(browser, { editor: true })
      await editor.frame
        .getByLabel('Title', { exact: true })
        .fill('Cafe opening hours')
      await editor.frame
        .getByRole('button', { name: 'Save', exact: true })
        .focus()
      assert.equal(
        await editor.frame
          .getByRole('button', { name: 'Save', exact: true })
          .evaluate((node) => getComputedStyle(node).outlineStyle),
        'solid'
      )
      await save(editor)
      await editor.frame.getByLabel('Title', { exact: true }).fill('Cafe hours')
      await save(editor)
      const writes = (await editor.page.evaluate(() => window.rpc)).filter(
        (call) => call.method === 'storage.set'
      )
      assert.deepEqual(
        writes.map((call) => call.params.expectedRevision),
        ['r1', 'r2']
      )
      await editor.page.evaluate(() => window.remount(false))
      await editor.frame.getByRole('heading', { name: 'Cafe hours' }).waitFor()
      await editor.page.evaluate(() => window.remount(true))
      await editor.frame.getByLabel('Title', { exact: true }).waitFor()
      assert.equal(
        await editor.frame.getByLabel('Title', { exact: true }).inputValue(),
        'Cafe hours'
      )
      // Explicit day selection must not turn the closed Sunday into a working day.
      await editor.frame
        .getByLabel('Monday, interval 1 end', { exact: true })
        .fill('17:00')
      await editor.frame.locator('.copy-picker summary').first().click()
      await editor.frame
        .getByRole('button', { name: 'Apply to selected days' })
        .first()
        .click()
      assert.equal(
        await editor.frame
          .getByLabel('Tuesday, interval 1 end', { exact: true })
          .inputValue(),
        '17:00'
      )
      assert.equal(
        await editor.frame
          .getByLabel('Sunday hours', { exact: true })
          .inputValue(),
        'closed'
      )
      await editor.frame
        .getByRole('button', { name: '+ Add special date' })
        .click()
      await editor.frame.getByLabel('Date', { exact: true }).fill('2026-11-12')
      await editor.frame
        .getByLabel('Label (optional)', { exact: true })
        .fill('Holiday')
      await save(editor)
      await editor.page.evaluate(() => window.remount(false))
      await editor.frame
        .locator('.status-line')
        .filter({ hasText: 'Closed now' })
        .waitFor()
      await finish(editor)

      const picker = await session(browser, { editor: true })
      const zoneInput = picker.frame.getByRole('combobox', {
        name: 'Business time zone',
      })
      assert.match(await zoneInput.inputValue(), /UTC/)
      await zoneInput.click()
      assert.equal(await zoneInput.getAttribute('aria-expanded'), 'true')
      await zoneInput.press('End')
      await zoneInput.press('Home')
      const firstId = await zoneInput.getAttribute('aria-activedescendant')
      assert.match(
        await picker.frame.locator(`[id="${firstId}"]`).textContent(),
        /UTC/
      )
      assert.ok(
        (await picker.frame.getByRole('listbox').getByRole('option').count()) >
          300
      )
      await zoneInput.fill('new york')
      assert.equal(
        await picker.frame.getByRole('listbox').getByRole('option').count(),
        1
      )
      await zoneInput.press('ArrowDown')
      const activeId = await zoneInput.getAttribute('aria-activedescendant')
      assert.equal(
        await picker.frame.locator(`[id="${activeId}"]`).getAttribute('role'),
        'option'
      )
      await zoneInput.press('Enter')
      assert.equal(await zoneInput.inputValue(), 'New York · America/New_York')
      assert.equal(await zoneInput.getAttribute('aria-expanded'), 'false')
      const zoneToggle = picker.frame.getByRole('button', {
        name: 'Show time zones',
      })
      await zoneToggle.click()
      assert.equal(await zoneInput.getAttribute('aria-expanded'), 'true')
      await zoneToggle.click()
      assert.equal(await zoneInput.getAttribute('aria-expanded'), 'false')
      await save(picker)
      assert.equal(
        JSON.parse((await picker.page.evaluate(() => window.getEntry())).value)
          .timeZone,
        'America/New_York'
      )
      await picker.page.evaluate(() => window.remount(false))
      await picker.frame
        .locator('.status-line')
        .filter({ hasText: 'Closed now' })
        .waitFor()
      await picker.page.evaluate(() => window.remount(true))
      await zoneInput.waitFor()
      assert.equal(await zoneInput.inputValue(), 'New York · America/New_York')
      await zoneInput.fill('Berlin')
      await zoneInput.press('Escape')
      assert.equal(await zoneInput.inputValue(), 'New York · America/New_York')
      await zoneInput.fill('not a real city')
      await picker.frame
        .locator('.zone-message')
        .filter({ hasText: 'No time zones found' })
        .waitFor()
      assert.equal(
        await picker.frame.getByRole('listbox').getByRole('option').count(),
        0
      )
      await zoneInput.press('ArrowDown')
      await zoneInput.press('Enter')
      await zoneInput.press('Tab')
      assert.equal(await zoneInput.inputValue(), 'New York · America/New_York')
      await picker.frame
        .getByRole('button', { name: 'Use my time zone' })
        .click()
      assert.equal(await zoneInput.inputValue(), 'Honolulu · Pacific/Honolulu')
      await zoneInput.fill('dubai')
      await picker.frame
        .getByRole('listbox')
        .getByRole('option', { name: /Dubai/ })
        .click()
      assert.equal(await zoneInput.inputValue(), 'Dubai · Asia/Dubai')
      await save(picker)
      assert.equal(
        JSON.parse((await picker.page.evaluate(() => window.getEntry())).value)
          .timeZone,
        'Asia/Dubai'
      )
      await picker.page.evaluate(() => window.remount(false))
      await picker.frame
        .locator('.status-line')
        .filter({ hasText: 'Open now' })
        .waitFor()
      await finish(picker)
      console.log(
        `${name}: layouts, live themes/font, dense content, keyboard focus, repeated saves, reopen, copy, holiday override and searchable time-zone picker passed`
      )
    } finally {
      await browser.close()
    }
  }

  const browser = await playwright.chromium.launch({ headless: true })
  try {
    for (const options of [
      { public: true },
      { readOnly: true },
      { denied: true },
      { saved: 'not-json' },
      { saved: 'null' },
      { saved: '[]' },
      { saved: '{"v":2}' },
    ]) {
      const s = await session(browser, { editor: true, ...options })
      assert.equal(
        await s.frame
          .getByRole('button', { name: 'Save', exact: true })
          .isDisabled(),
        true
      )
      assert.equal(
        (await s.page.evaluate(() => window.rpc)).some(
          (call) => call.method === 'storage.set'
        ),
        false
      )
      if (options.public || options.readOnly)
        assert.equal(
          await s.frame
            .getByRole('combobox', { name: 'Business time zone' })
            .isDisabled(),
          true
        )
      await finish(s)
    }
    for (const options of [{ conflict: true }, { uncertain: true }]) {
      const s = await session(browser, { editor: true, ...options })
      await s.frame.getByLabel('Title', { exact: true }).fill('Keep my draft')
      await s.frame.getByRole('button', { name: 'Save', exact: true }).click()
      await s.frame.locator('.status.is-error').waitFor()
      assert.equal(
        await s.frame.getByLabel('Title', { exact: true }).inputValue(),
        'Keep my draft'
      )
      assert.equal(
        await s.frame
          .getByRole('button', { name: 'Save', exact: true })
          .isDisabled(),
        true
      )
      assert.equal(
        (await s.page.evaluate(() => window.rpc)).filter(
          (call) => call.method === 'storage.set'
        ).length,
        1
      )
      await finish(s)
    }
    const create = await session(browser, { editor: true, saved: null })
    await save(create)
    const first = (await create.page.evaluate(() => window.rpc)).find(
      (call) => call.method === 'storage.set'
    )
    assert.equal(Object.hasOwn(first.params, 'expectedRevision'), false)
    await create.frame
      .getByLabel('Monday, interval 1 end', { exact: true })
      .fill('09:00')
    await create.frame
      .getByRole('button', { name: 'Save', exact: true })
      .click()
    await create.frame
      .locator('.status.is-error')
      .filter({ hasText: 'same' })
      .waitFor()
    await create.page.evaluate(() =>
      window.setLayout({ size: '2:2', width: 320, height: 600 })
    )
    assert.equal(
      await create.frame
        .locator('body')
        .evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true
    )
    await finish(create)

    const aliasData = { ...clone(DEFAULTS), timeZone: 'US/Eastern' }
    const alias = await session(browser, {
      editor: true,
      saved: JSON.stringify(aliasData),
      noZoneList: true,
    })
    const aliasInput = alias.frame.getByRole('combobox', {
      name: 'Business time zone',
    })
    assert.equal(await aliasInput.inputValue(), 'Eastern · US/Eastern')
    await aliasInput.click()
    assert.equal(
      await alias.frame
        .getByRole('listbox')
        .getByRole('option', { selected: true })
        .count(),
      1
    )
    assert.match(
      await alias.frame
        .getByRole('listbox')
        .getByRole('option', { selected: true })
        .textContent(),
      /US\/Eastern/
    )
    await aliasInput.press('Escape')
    await save(alias)
    assert.equal(
      JSON.parse((await alias.page.evaluate(() => window.getEntry())).value)
        .timeZone,
      'US/Eastern'
    )
    await aliasInput.fill('Berlin')
    await alias.frame
      .getByRole('listbox')
      .getByRole('option', { name: /Berlin/ })
      .click()
    await finish(alias)

    const touch = await session(browser, { editor: true, touch: true })
    await touch.page.evaluate(() =>
      window.setLayout({ size: '2:2', width: 320, height: 600 })
    )
    const touchInput = touch.frame.getByRole('combobox', {
      name: 'Business time zone',
    })
    await touchInput.fill('Dubai')
    const option = touch.frame
      .getByRole('listbox')
      .getByRole('option', { name: /Dubai/ })
    assert.equal(
      await touch.frame.locator('.zone-popup').evaluate((node) => {
        const r = node.getBoundingClientRect()
        return (
          r.left >= 0 &&
          r.right <= innerWidth &&
          node.scrollWidth <= node.clientWidth
        )
      }),
      true
    )
    assert.ok((await option.boundingBox()).height >= 40)
    await option.tap()
    assert.equal(await touchInput.inputValue(), 'Dubai · Asia/Dubai')
    await save(touch)
    await finish(touch)

    for (const options of [
      { denied: true },
      { saved: 'not-json' },
      { absent: true },
    ]) {
      const s = await session(browser, options)
      assert.match(await s.frame.locator('#hours').textContent(), /unavailable/)
      assert.equal(await s.frame.locator('.status-line').count(), 0)
      await finish(s)
    }
    const ticking = await session(browser)
    await ticking.page.clock.fastForward(7.5 * 3600_000 + 100)
    await ticking.frame
      .locator('.status-line')
      .filter({ hasText: 'Closed now' })
      .waitFor()
    await finish(ticking)
    console.log(
      'chromium: read-only/missing capabilities, invalid storage, create-only saves, validation, conflicts/uncertain writes without retries, saved zone aliases, older-browser zone fallback, touch/narrow editor, absent host and clock refresh passed'
    )
  } finally {
    await browser.close()
  }
} finally {
  await new Promise((resolve) => server.close(resolve))
}
