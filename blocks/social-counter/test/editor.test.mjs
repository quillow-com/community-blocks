import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm'
import test from 'node:test'

const epoch = Date.UTC(2026, 10, 12)

class Element {
  children = []
  listeners = new Map()
  attributes = new Map()
  value = ''
  checked = false
  disabled = false
  hidden = false
  className = ''
  text = ''

  constructor(tag) {
    this.tag = tag
    this.classList = {
      add() {},
      remove() {},
    }
  }

  append(...children) {
    this.children.push(...children)
  }

  setAttribute(name, value) {
    this.attributes.set(name, value)
  }

  get textContent() {
    return this.text + this.children.map((node) => node.textContent).join('')
  }

  set textContent(value) {
    this.children = []
    this.text = String(value)
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  async emit(type) {
    for (const listener of this.listeners.get(type) ?? []) await listener()
  }

  find(predicate) {
    if (predicate(this)) return this
    for (const child of this.children) {
      const found = child.find(predicate)
      if (found) return found
    }
  }
}

async function editor(t, initial = {}) {
  let now = epoch
  let stored = initial === null ? null : JSON.stringify(initial)
  let revision = 1
  let failNext = false
  let pendingSave
  const writes = []
  const root = new Element('div')
  const window = { addEventListener() {} }
  window.parent = window
  const context = createContext({
    window,
    document: {
      getElementById: () => root,
      createElement: (tag) => new Element(tag),
      createTextNode: (text) => {
        const node = new Element('#text')
        node.textContent = text
        return node
      },
    },
    Node: Element,
    TextEncoder,
    URL,
    console,
    Date: class extends Date {
      static now() {
        return now
      }
    },
  })
  class WidgetSDKError extends Error {
    constructor(code) {
      super(code)
      this.code = code
    }
  }
  const entry = () =>
    stored === null ? null : { value: stored, revision: String(revision) }
  const widget = {
    mode: 'editor',
    capabilities: ['storage.get', 'storage.set'],
    storage: {
      async get() {
        return entry()
      },
      async set(key, value, options) {
        assert.equal(key, 'settings')
        assert.equal(options.expectedRevision, entry()?.revision)
        if (pendingSave) {
          const wait = pendingSave
          pendingSave = undefined
          await wait
        }
        if (failNext) {
          failNext = false
          throw new WidgetSDKError('widget_storage_quota_exceeded')
        }
        stored = value
        revision++
        writes.push(JSON.parse(value))
        return entry()
      },
    },
    destroy() {},
  }
  const sdk = new SyntheticModule(
    ['Quillow', 'connect', 'WidgetSDKError'],
    function () {
      this.setExport('Quillow', {})
      this.setExport('connect', async () => widget)
      this.setExport('WidgetSDKError', WidgetSDKError)
    },
    { context }
  )
  const base = new URL('../package/', import.meta.url)
  const modules = new Map([[new URL('runtime.js', base).href, sdk]])
  for (const name of [
    'settings/editor.mjs',
    'settings/editor-kit.mjs',
    'settings.mjs',
    'kit.mjs',
  ]) {
    const url = new URL(name, base)
    modules.set(
      url.href,
      new SourceTextModule(await readFile(url, 'utf8'), {
        context,
        identifier: url.href,
      })
    )
  }
  const main = modules.get(new URL('settings/editor.mjs', base).href)
  await main.link((specifier, referencing) => {
    const url = new URL(specifier, referencing.identifier).href
    assert.ok(modules.has(url), `Unexpected import: ${url}`)
    return modules.get(url)
  })
  await main.evaluate()
  await setImmediate()
  const save = root.find(
    (node) => node.tag === 'button' && node.textContent === 'Save'
  )
  assert.equal(save.disabled, false)
  t.after(() => assert.equal(save.disabled, false))

  return {
    writes,
    value: () => JSON.parse(stored),
    time: (offset) => (now = epoch + offset),
    fail: () => (failNext = true),
    defer() {
      let release
      pendingSave = new Promise((resolve) => (release = resolve))
      return release
    },
    save: () => save.emit('click'),
    async change(label, value) {
      const field = root.find((node) =>
        node.children.some(
          (child) => child.tag === 'label' && child.textContent === label
        )
      )
      assert.ok(field, `Missing field: ${label}`)
      const id = field
        .find((node) => node.tag === 'label')
        .attributes.get('for')
      const input = root.find((node) => node.attributes.get('id') === id)
      assert.ok(input, `Missing input: ${label}`)
      const isSwitch = input.attributes.get('role') === 'switch'
      if (isSwitch) input.checked = value
      else input.value = String(value)
      await input.emit(isSwitch ? 'change' : 'input')
    },
  }
}

test('repeated saves and appearance edits preserve the last saved growth epoch', async (t) => {
  const form = await editor(t, {
    count: 100,
    grow: true,
    dailyMin: 86400,
    dailyMax: 86400,
    asOf: epoch - 1000,
  })
  await form.change('Current count', 200)
  await form.save()
  assert.equal(form.value().asOf, epoch)
  form.time(60_000)
  await form.save()
  assert.equal(form.writes.length, 1, 'A no-op save must not write again')
  await form.change('Label', 'Audience')
  await form.change('Use the platform’s colour', false)
  await form.save()
  assert.equal(form.value().asOf, epoch)
  assert.equal(form.value().label, 'Audience')
  assert.equal(form.value().brand, false)
})

for (const [label, value] of [
  ['Current count', 300],
  ['Simulate daily growth', false],
  ['Gain per day (min)', 15],
  ['Gain per day (max)', 40],
]) {
  test(`${label} resets the epoch once per successfully saved change`, async (t) => {
    const form = await editor(t, { count: 100, grow: true, asOf: epoch - 1000 })
    await form.change(label, value)
    await form.save()
    assert.equal(form.value().asOf, epoch)
    form.time(60_000)
    await form.save()
    assert.equal(form.writes.length, 1)
    assert.equal(form.value().asOf, epoch)
  })
}

test('new settings initialize the epoch only on their first successful save', async (t) => {
  const form = await editor(t, null)
  await form.change('Simulate daily growth', true)
  await form.save()
  assert.equal(form.value().asOf, epoch)
  form.time(60_000)
  await form.save()
  assert.equal(form.writes.length, 1)
  assert.equal(form.value().asOf, epoch)
})

test('a failed save does not replace the last saved baseline', async (t) => {
  const original = epoch - 1000
  const form = await editor(t, { count: 100, grow: true, asOf: original })
  await form.change('Current count', 200)
  form.fail()
  await form.save()
  assert.equal(form.value().count, 100)
  assert.equal(form.value().asOf, original)
  form.time(60_000)
  await form.change('Current count', 100)
  await form.change('Label', 'Audience')
  await form.save()
  assert.equal(form.value().asOf, original)
  assert.equal(form.value().label, 'Audience')
})

test('edits made during a save are not mistaken for the acknowledged snapshot', async (t) => {
  const form = await editor(t, { count: 100, grow: true, asOf: epoch - 1000 })
  await form.change('Current count', 200)
  const release = form.defer()
  const saving = form.save()
  await form.change('Current count', 300)
  release()
  await saving
  assert.equal(form.value().count, 200)
  form.time(60_000)
  await form.save()
  assert.equal(form.value().count, 300)
  assert.equal(form.value().asOf, epoch + 60_000)
})
