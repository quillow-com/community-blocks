// Shared helpers for the block's main document (not the settings page).
import { Quillow, connect, WidgetSDKError } from './runtime.js'

export { Quillow, WidgetSDKError }

/** Start the single theme/layout bridge. Standalone previews keep CSS fallbacks. */
export function startTheme() {
  if (window.parent === window) return
  try {
    Quillow.start()
  } catch {
    /* keep CSS fallbacks */
  }
}

async function readOnce(keys, timeout) {
  let widget
  try {
    widget = await connect({ timeout, requestTimeout: timeout })
    if (!widget.capabilities.includes('storage.get'))
      return {
        status: 'unavailable',
        values: {},
        code: 'NO_STORAGE_CAPABILITY',
      }
    const entries = await Promise.all(
      keys.map((key) => widget.storage.get(key))
    )
    const values = {}
    keys.forEach((key, i) => {
      values[key] = entries[i] ? entries[i].value : null
    })
    return { status: 'ok', values }
  } catch (error) {
    const code = error instanceof WidgetSDKError ? error.code : 'ERROR'
    return {
      status: code === 'HOST_UNAVAILABLE' ? 'standalone' : 'unavailable',
      values: {},
      code,
    }
  } finally {
    widget?.destroy()
  }
}

/**
 * Read the given storage keys once. Never throws and never retries.
 * status: 'ok' | 'standalone' (no host iframe) | 'unavailable' (host/storage problem)
 * values: key -> string | null (null = never saved); code: SDK error code when unavailable.
 */
export async function loadStored(keys, { timeout = 4500 } = {}) {
  const result = await readOnce(keys, timeout)
  if (result.status === 'unavailable') {
    document.documentElement.dataset.storageError = result.code
    console.warn('[Quillow block] storage unavailable:', result.code)
  }
  return result
}

/** "Name unavailable right now." plus the technical reason when viewed in the editor. */
export function unavailableText(name, code) {
  const detail =
    code && document.documentElement.dataset.quillowEnvironment === 'editor'
      ? ` (${code})`
      : ''
  return `${name} unavailable right now.${detail}`
}

/** Parse JSON text; returns undefined for anything malformed. */
export function parseJSON(text) {
  if (typeof text !== 'string' || text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export const isObj = (v) =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export function str(value, fallback = '', max = 500) {
  return typeof value === 'string' ? value.slice(0, max) : fallback
}

export function int(value, fallback, min, max) {
  const n = typeof value === 'number' ? value : Number.NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function num(value, fallback, min, max) {
  const n = typeof value === 'number' ? value : Number.NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
}

export function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

export function hex(value, fallback) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value
    : fallback
}

/** Only absolute https URLs are used for navigation. */
export function httpsUrl(value) {
  if (typeof value !== 'string') return ''
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

/** Only data: image URLs produced by the settings page are rendered as images. */
export function dataImage(value) {
  return typeof value === 'string' &&
    /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(value)
    ? value
    : ''
}

/** Navigate the top page from a click handler (must stay synchronous). */
export function goTop(url) {
  if (!url) return
  window.top.location.href = url
}

export const reduceMotion = () =>
  matchMedia('(prefers-reduced-motion: reduce)').matches

/** Tiny DOM builder: el('div', { class: 'x', onClick }, child, ...). Text is always set as text. */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'class') node.className = value
    else if (key.startsWith('on') && typeof value === 'function')
      node.addEventListener(key.slice(2).toLowerCase(), value)
    else node.setAttribute(key, value === true ? '' : String(value))
  }
  const add = (child) => {
    if (child === null || child === undefined || child === false) return
    if (Array.isArray(child)) child.forEach(add)
    else
      node.append(
        child instanceof Node ? child : document.createTextNode(String(child))
      )
  }
  children.forEach(add)
  return node
}

const ICONS = {
  left: '<path d="M15 6l-6 6 6 6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
}

/** Inline stroke icon (24 x 24 viewBox). */
export function icon(name) {
  const span = document.createElement('span')
  span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`
  return span.firstElementChild
}

/** Current block size, from the host attribute with a sensible standalone fallback. */
export function blockSize() {
  const s = document.documentElement.dataset.quillowSize
  if (s === '1:1' || s === '2:1' || s === '2:2') return s
  return innerWidth <= 220 && innerHeight <= 220
    ? '1:1'
    : innerHeight <= 220
      ? '2:1'
      : '2:2'
}

/** Call fn when the block's size composition changes. */
export function onSizeChange(fn) {
  let last = blockSize()
  const check = () => {
    const now = blockSize()
    if (now !== last) {
      last = now
      fn(now)
    }
  }
  new ResizeObserver(check).observe(document.documentElement)
  new MutationObserver(check).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-quillow-size'],
  })
}

export const isEditorEnv = () =>
  document.documentElement.dataset.quillowEnvironment === 'editor'
