import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm'
import test from 'node:test'

import { KEY, normalize } from '../package/settings.mjs'

class Element extends EventTarget {
  children = []
  attributes = new Map()
  classes = new Set()
  dataset = {}
  scrollTop = 0
  scrollHeight = 100
  clientHeight = 50
  markCalls = 0

  constructor(tag) {
    super()
    this.tag = tag
    this.classList = {
      contains: (name) => this.classes.has(name),
      toggle: (name, force) => {
        if (name === 'is-clipped') this.markCalls++
        const on = force ?? !this.classes.has(name)
        if (on) this.classes.add(name)
        else this.classes.delete(name)
        return on
      },
    }
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value))
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null
  }

  append(...children) {
    this.children.push(...children.flat(Infinity))
  }

  replaceChildren(...children) {
    this.children = []
    this.append(...children)
  }

  get textContent() {
    return this.children
      .map((child) => (child instanceof Element ? child.textContent : child))
      .join('')
  }

  matches(selector) {
    if (selector.startsWith('.')) return this.classes.has(selector.slice(1))
    const key = selector.match(/^\[data-k="([^"]+)"\]$/)?.[1]
    return key !== undefined && this.getAttribute('data-k') === key
  }

  querySelectorAll(selector) {
    const found = []
    for (const child of this.children) {
      if (!(child instanceof Element)) continue
      if (child.matches(selector)) found.push(child)
      found.push(...child.querySelectorAll(selector))
    }
    return found
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null
  }

  focus() {}

  click() {
    this.dispatchEvent(new Event('click'))
  }
}

async function app({ size = '1:1', firstOpen = false, items } = {}) {
  const root = new Element('main')
  const tasks = []
  let onSizeChange
  const data = normalize({
    firstOpen,
    items:
      items ?? [1, 2, 3].map((n) => ({ q: `Question ${n}`, a: `Answer ${n}` })),
  })
  const kit = {
    blockSize: () => size,
    el(tag, props, ...children) {
      const node = new Element(tag)
      for (const [key, value] of Object.entries(props ?? {})) {
        if (key === 'class') node.classes = new Set(value.split(/\s+/))
        else if (key.startsWith('on'))
          node.addEventListener(key.slice(2).toLowerCase(), value)
        else node.setAttribute(key, value)
      }
      node.append(...children.filter((child) => child !== null))
      return node
    },
    icon: () => new Element('svg'),
    isEditorEnv: () => false,
    loadStored: async () => ({
      status: 'ok',
      values: { [KEY]: JSON.stringify(data) },
    }),
    onSizeChange: (callback) => (onSizeChange = callback),
    parseJSON: JSON.parse,
    startTheme() {},
    unavailableText: () => 'FAQ unavailable right now.',
  }
  const context = createContext({
    document: {
      getElementById: () => root,
      body: new Element('body'),
    },
    requestAnimationFrame: (callback) => tasks.push(callback),
    setTimeout: (callback) => tasks.push(callback),
  })
  const module = (exports) =>
    new SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [name, value] of Object.entries(exports))
          this.setExport(name, value)
      },
      { context }
    )
  const imports = {
    './kit.mjs': module(kit),
    './settings.mjs': module({ KEY, normalize }),
  }
  const main = new SourceTextModule(
    await readFile(new URL('../package/app.mjs', import.meta.url), 'utf8'),
    { context }
  )
  await main.link((specifier) => {
    assert.ok(imports[specifier], `Unexpected import: ${specifier}`)
    return imports[specifier]
  })
  await main.evaluate()

  function settle() {
    while (tasks.length) tasks.shift()()
  }
  settle()
  assert.equal(root.dataset.size, size)
  return {
    root,
    settle,
    resize(next) {
      size = next
      onSizeChange(next)
      settle()
    },
    next() {
      root.querySelector('[data-k="next"]').click()
      settle()
    },
  }
}

test('small and medium layouts preserve the selected question with firstOpen enabled', async () => {
  const faq = await app({ firstOpen: true })
  faq.next()
  faq.next()
  assert.equal(faq.root.querySelector('.q').textContent, 'Question 3')
  faq.resize('2:1')
  assert.equal(faq.root.querySelector('.q').textContent, 'Question 3')
  faq.resize('1:1')
  assert.equal(faq.root.querySelector('.q').textContent, 'Question 3')
})

test('leaving large uses its expanded question without pinning subsequent paged navigation', async () => {
  const faq = await app({ size: '2:2' })
  faq.root.querySelectorAll('.acc-q')[1].click()
  faq.settle()
  faq.resize('1:1')
  assert.equal(faq.root.querySelector('.q').textContent, 'Question 2')
  faq.next()
  faq.resize('2:1')
  assert.equal(faq.root.querySelector('.q').textContent, 'Question 3')
})

test('a closed large accordion preserves the previous paged selection', async () => {
  const faq = await app()
  faq.next()
  faq.next()
  faq.resize('2:2')
  faq.resize('1:1')
  assert.equal(faq.root.querySelector('.q').textContent, 'Question 3')
})

test('accordion toggles do not accumulate scroll handlers', async () => {
  const faq = await app({ size: '2:2' })
  const list = faq.root.querySelector('.acc')
  for (let i = 0; i < 10; i++) {
    faq.root.querySelectorAll('.acc-q')[i % 3].click()
    faq.settle()
  }
  const calls = list.markCalls
  list.scrollTop = list.scrollHeight - list.clientHeight
  list.dispatchEvent(new Event('scroll'))
  assert.equal(list.markCalls - calls, 1)
  assert.equal(list.classList.contains('is-clipped'), false)
  list.scrollTop = 0
  list.dispatchEvent(new Event('scroll'))
  assert.equal(list.classList.contains('is-clipped'), true)
})

test('new scroll containers receive one working handler after each render', async () => {
  const faq = await app()
  for (const size of ['2:1', '1:1', '2:2', '2:1']) {
    faq.resize(size)
    for (const node of faq.root.querySelectorAll('.scroll')) {
      const calls = node.markCalls
      node.scrollTop = node.scrollHeight - node.clientHeight
      node.dispatchEvent(new Event('scroll'))
      assert.equal(node.markCalls - calls, 1)
      assert.equal(node.classList.contains('is-clipped'), false)
    }
  }
})

test('empty FAQ remains valid across all layouts', async () => {
  const faq = await app({ items: [], firstOpen: true })
  for (const size of ['2:2', '2:1', '1:1']) {
    faq.resize(size)
    assert.equal(
      faq.root.querySelector('.faq-empty').textContent,
      'No questions yet.'
    )
  }
})
