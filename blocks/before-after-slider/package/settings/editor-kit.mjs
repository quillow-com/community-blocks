// Shared helpers for block settings pages (loaded from settings/editor.mjs).
import { Quillow, connect, WidgetSDKError } from '../runtime.js'

export { WidgetSDKError }

export class ValidationError extends Error {}

/* ------------------------------------------------------------------ DOM */

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag)
  const late = {}
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'class') el.className = value
    else if (key.startsWith('on') && typeof value === 'function')
      el.addEventListener(key.slice(2).toLowerCase(), value)
    else if (key === 'value' || key === 'checked' || key === 'disabled')
      late[key] = value
    else el.setAttribute(key, value === true ? '' : String(value))
  }
  const add = (child) => {
    if (child === null || child === undefined || child === false) return
    if (Array.isArray(child)) child.forEach(add)
    else
      el.append(
        child instanceof Node ? child : document.createTextNode(String(child))
      )
  }
  children.forEach(add)
  Object.assign(el, late)
  return el
}

let uid = 0
const nextId = () => `f${++uid}`

function field(label, hint, control, id, extraClass = '') {
  return h(
    'div',
    { class: `field ${extraClass}` },
    label ? h('label', { for: id, class: 'field-label' }, label) : null,
    control,
    hint ? h('p', { class: 'field-hint' }, hint) : null
  )
}

export function textField({
  label,
  hint,
  value = '',
  onInput,
  maxlength,
  placeholder,
  multiline,
  rows = 4,
  type = 'text',
}) {
  const id = nextId()
  const input = multiline
    ? h('textarea', { id, rows, maxlength, placeholder, value })
    : h('input', {
        id,
        type,
        maxlength,
        placeholder,
        value,
        autocomplete: 'off',
        spellcheck: 'false',
      })
  if (type === 'text' || multiline) input.spellcheck = true
  input.addEventListener('input', () => onInput?.(input.value))
  return { el: field(label, hint, input, id), input }
}

export function numberField({
  label,
  hint,
  value,
  onInput,
  min,
  max,
  step = 1,
}) {
  const id = nextId()
  const input = h('input', {
    id,
    type: 'number',
    min,
    max,
    step,
    value: value ?? '',
    inputmode: 'decimal',
  })
  input.addEventListener('input', () =>
    onInput?.(input.value === '' ? null : Number(input.value))
  )
  return { el: field(label, hint, input, id), input }
}

export function rangeField({
  label,
  hint,
  value,
  min = 0,
  max = 100,
  step = 1,
  onInput,
  format = (v) => v + '%',
}) {
  const id = nextId()
  const out = h('output', { class: 'range-out', for: id }, format(value))
  const input = h('input', { id, type: 'range', min, max, step, value })
  input.addEventListener('input', () => {
    out.textContent = format(Number(input.value))
    onInput?.(Number(input.value))
  })
  return {
    el: field(label, hint, h('div', { class: 'range-row' }, input, out), id),
    input,
  }
}

export function selectField({ label, hint, value, options, onChange }) {
  const id = nextId()
  const select = h(
    'select',
    { id },
    options.map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o]
      return h('option', { value: v }, l)
    })
  )
  select.value = value
  select.addEventListener('change', () => onChange?.(select.value))
  return { el: field(label, hint, select, id), input: select }
}

export function switchField({ label, hint, checked, onChange }) {
  const id = nextId()
  const input = h('input', {
    id,
    type: 'checkbox',
    role: 'switch',
    class: 'switch',
    checked: !!checked,
  })
  input.addEventListener('change', () => onChange?.(input.checked))
  return {
    el: h(
      'div',
      { class: 'field field-row' },
      h(
        'div',
        { class: 'field-text' },
        h('label', { for: id, class: 'field-label' }, label),
        hint ? h('p', { class: 'field-hint' }, hint) : null
      ),
      input
    ),
    input,
  }
}

export function colorField({
  label,
  hint,
  value,
  onInput,
  allowEmpty = false,
  emptyLabel = 'Theme default',
}) {
  const id = nextId()
  const picker = h('input', {
    type: 'color',
    class: 'swatch',
    'aria-label': `${label} picker`,
    value: /^#[0-9a-f]{6}$/i.test(value) ? value : '#7f51f2',
  })
  const text = h('input', {
    id,
    type: 'text',
    maxlength: 7,
    value: value || '',
    placeholder: allowEmpty ? emptyLabel : '#7f51f2',
    autocomplete: 'off',
    spellcheck: 'false',
    class: 'hex',
  })
  picker.addEventListener('input', () => {
    text.value = picker.value
    onInput?.(picker.value)
  })
  text.addEventListener('input', () => {
    const v = text.value.trim()
    if (/^#[0-9a-f]{6}$/i.test(v)) {
      picker.value = v
      onInput?.(v)
    } else if (allowEmpty && v === '') onInput?.('')
  })
  const reset = allowEmpty
    ? button(emptyLabel, {
        class: 'btn btn-quiet',
        onClick: () => {
          text.value = ''
          onInput?.('')
        },
      })
    : null
  const wrap = h('div', { class: 'color-row' }, picker, text, reset)
  return { el: field(label, hint, wrap, id), picker, text }
}

export function segmented({ label, hint, value, options, onChange }) {
  const group = h('div', {
    class: 'segmented',
    role: 'radiogroup',
    'aria-label': label,
  })
  const buttons = options.map(([v, l]) => {
    const b = h(
      'button',
      {
        type: 'button',
        role: 'radio',
        'aria-checked': String(v === value),
        class: v === value ? 'on' : '',
      },
      l
    )
    b.addEventListener('click', () => {
      buttons.forEach((x) => {
        x.classList.remove('on')
        x.setAttribute('aria-checked', 'false')
      })
      b.classList.add('on')
      b.setAttribute('aria-checked', 'true')
      onChange?.(v)
    })
    return b
  })
  group.append(...buttons)
  return {
    el: h(
      'div',
      { class: 'field' },
      h('span', { class: 'field-label' }, label),
      group,
      hint ? h('p', { class: 'field-hint' }, hint) : null
    ),
  }
}

export function section(title, description, ...children) {
  return h(
    'section',
    { class: 'section' },
    h('h2', {}, title),
    description ? h('p', { class: 'section-desc' }, description) : null,
    ...children
  )
}

export function button(label, props = {}) {
  return h('button', { type: 'button', ...props }, label)
}

const icons = {
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3"/>',
}
export function icon(name) {
  const span = h('span', { class: 'icon', 'aria-hidden': 'true' })
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`
  return span
}

/**
 * Re-orderable list editor. `items` is mutated in place.
 * renderItem(item, index) -> Node (the item's fields). Return value of
 * `onChange` is not used. `make()` creates a blank item.
 */
export function listEditor({
  items,
  renderItem,
  make,
  max,
  min = 0,
  addLabel = 'Add item',
  itemLabel = 'Item',
  onChange,
  summary,
}) {
  const root = h('div', { class: 'list' })
  const list = h('ol', { class: 'list-items' })
  const addBtn = button(addLabel, { class: 'btn btn-secondary' })
  const count = h('p', { class: 'field-hint' })
  root.append(list, h('div', { class: 'list-foot' }, addBtn, count))

  function render() {
    list.replaceChildren()
    items.forEach((item, i) => {
      const head = h(
        'div',
        { class: 'item-head' },
        h(
          'span',
          { class: 'item-title' },
          `${itemLabel} ${i + 1}`,
          summary ? h('span', { class: 'item-summary' }, summary(item)) : null
        ),
        h(
          'div',
          { class: 'item-actions' },
          button(icon('up'), {
            class: 'btn-icon',
            'aria-label': `Move ${itemLabel.toLowerCase()} ${i + 1} up`,
            disabled: i === 0,
            onClick: () => move(i, -1),
          }),
          button(icon('down'), {
            class: 'btn-icon',
            'aria-label': `Move ${itemLabel.toLowerCase()} ${i + 1} down`,
            disabled: i === items.length - 1,
            onClick: () => move(i, 1),
          }),
          button(icon('trash'), {
            class: 'btn-icon danger',
            'aria-label': `Remove ${itemLabel.toLowerCase()} ${i + 1}`,
            disabled: items.length <= min,
            onClick: () => remove(i),
          })
        )
      )
      list.append(
        h(
          'li',
          { class: 'item' },
          head,
          h('div', { class: 'item-body' }, renderItem(item, i))
        )
      )
    })
    addBtn.disabled = max !== undefined && items.length >= max
    count.textContent = max !== undefined ? `${items.length} of ${max}` : ''
  }
  function move(i, d) {
    const j = i + d
    if (j < 0 || j >= items.length) return
    ;[items[i], items[j]] = [items[j], items[i]]
    render()
    onChange?.()
  }
  function remove(i) {
    if (items.length <= min) return
    items.splice(i, 1)
    render()
    onChange?.()
  }
  addBtn.addEventListener('click', () => {
    if (max !== undefined && items.length >= max) return
    items.push(make())
    render()
    onChange?.()
    list.lastElementChild?.querySelector('input, textarea, select')?.focus()
  })
  render()
  return { el: root, render }
}

/* --------------------------------------------------------------- images */

async function loadBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    const url = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  }
}

function drawToUrl(source, dim, quality, square) {
  const sw = source.width
  const sh = source.height
  let cw,
    ch,
    sx = 0,
    sy = 0,
    sWidth = sw,
    sHeight = sh
  if (square) {
    const side = Math.min(sw, sh)
    sx = (sw - side) / 2
    sy = (sh - side) / 2
    sWidth = sHeight = side
    cw = ch = Math.min(dim, side)
  } else {
    const scale = Math.min(1, dim / Math.max(sw, sh))
    cw = Math.max(1, Math.round(sw * scale))
    ch = Math.max(1, Math.round(sh * scale))
  }
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, cw, ch)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, sx, sy, sWidth, sHeight, 0, 0, cw, ch)
  let url = canvas.toDataURL('image/webp', quality)
  if (!url.startsWith('data:image/webp'))
    url = canvas.toDataURL('image/jpeg', quality)
  return url
}

/** Downscale + re-encode an image file until it fits a storage value. */
export async function compressImage(
  file,
  { maxDim = 720, maxChars = 60000, square = false } = {}
) {
  if (!file.type.startsWith('image/'))
    throw new ValidationError('Choose an image file (PNG, JPG, WebP or GIF).')
  let bitmap
  try {
    bitmap = await loadBitmap(file)
  } catch {
    throw new ValidationError(
      'That image could not be read. Try a different file.'
    )
  }
  try {
    for (const scale of [1, 0.86, 0.72, 0.6, 0.5, 0.4]) {
      for (const quality of [0.82, 0.66, 0.5]) {
        const url = drawToUrl(
          bitmap,
          Math.round(maxDim * scale),
          quality,
          square
        )
        if (url.length <= maxChars) return url
      }
    }
  } finally {
    bitmap.close?.()
  }
  throw new ValidationError(
    'That image is too detailed to store. Try a simpler or smaller image.'
  )
}

export function imageField({
  label,
  hint,
  value,
  onChange,
  maxDim,
  maxChars,
  square = false,
  emptyText = 'No image',
}) {
  const id = nextId()
  const preview = h('div', { class: `thumb${square ? ' thumb-square' : ''}` })
  const note = h('p', { class: 'field-hint', role: 'status' })
  const input = h('input', {
    id,
    type: 'file',
    accept: 'image/*',
    class: 'sr-only',
  })
  const choose = h(
    'label',
    { for: id, class: 'btn btn-secondary' },
    'Choose image'
  )
  const remove = button('Remove', { class: 'btn btn-quiet' })
  let current = value || ''

  function paint() {
    preview.replaceChildren(
      current ? h('img', { src: current, alt: '' }) : h('span', {}, emptyText)
    )
    remove.hidden = !current
    note.textContent = current
      ? `${(current.length / 1024).toFixed(0)} KB stored`
      : ''
  }
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    note.textContent = 'Processing…'
    try {
      current = await compressImage(file, { maxDim, maxChars, square })
      onChange?.(current)
      paint()
    } catch (error) {
      paint()
      note.textContent =
        error instanceof ValidationError
          ? error.message
          : 'That image could not be processed.'
    }
  })
  remove.addEventListener('click', () => {
    current = ''
    onChange?.('')
    paint()
  })
  paint()
  return {
    el: h(
      'div',
      { class: 'field image-field' },
      label ? h('span', { class: 'field-label' }, label) : null,
      h(
        'div',
        { class: 'image-row' },
        preview,
        h(
          'div',
          { class: 'image-actions' },
          h('div', { class: 'btn-row' }, choose, remove),
          note
        )
      ),
      input,
      hint ? h('p', { class: 'field-hint' }, hint) : null
    ),
    set(v) {
      current = v
      paint()
    },
  }
}

/* ---------------------------------------------------------------- store */

const encoder = new TextEncoder()
export const VALUE_LIMIT = 64 * 1024

/** Throws ValidationError if a value is too large for one storage entry. */
export function checkSize(label, value) {
  if (encoder.encode(value).length > VALUE_LIMIT - 512) {
    throw new ValidationError(
      `${label} is too large to save (limit is 64 KB). Remove some content or use smaller images.`
    )
  }
}

export function describeError(error) {
  if (error instanceof ValidationError) return error.message
  if (error instanceof WidgetSDKError) {
    if (error.mutationMayHaveSucceeded)
      return 'The save may or may not have gone through. Close and reopen settings to check what was stored before saving again.'
    switch (error.code) {
      case 'widget_storage_conflict':
        return 'These settings were changed somewhere else. Close and reopen settings to load the latest version (copy anything you need from this screen first).'
      case 'widget_storage_quota_exceeded':
        return 'There is too much content to save (limit is 1 MB per block). Remove some items or use smaller images.'
      case 'PERMISSION_DENIED':
        return 'You do not have permission to change these settings.'
      case 'CONNECT_TIMEOUT':
      case 'HOST_UNAVAILABLE':
        return 'Settings storage is not available here, so nothing can be saved.'
      default:
        return `Unable to save (${error.code}).`
    }
  }
  return 'Something went wrong. Nothing was saved.'
}

/**
 * Standard settings-page shell: heading, form, save bar, storage lifecycle.
 *   build(values, ctx) -> { el, serialize } where serialize() returns
 *   { storageKey: stringValue } (only keys that changed or all keys) or throws ValidationError.
 */
export async function startEditor({ root, title, description, keys, build }) {
  if (window.parent !== window) {
    try {
      Quillow.start()
    } catch {
      /* theme optional */
    }
  }
  const status = h(
    'p',
    { class: 'status', role: 'status', 'aria-live': 'polite' },
    'Loading settings…'
  )
  const saveBtn = h(
    'button',
    { type: 'button', class: 'btn btn-primary', disabled: true },
    'Save'
  )
  const formHost = h('div', { class: 'form' })
  root.append(
    h(
      'header',
      { class: 'ed-head' },
      h('h1', {}, title),
      description ? h('p', {}, description) : null
    ),
    formHost,
    h(
      'div',
      { class: 'ed-bar' },
      h('div', { class: 'ed-bar-inner' }, status, saveBtn)
    )
  )

  let widget
  const entries = {}
  let locked = false
  let saving = false
  const last = {}

  window.addEventListener('pagehide', () => {
    widget?.destroy()
    Quillow.destroy()
  })

  try {
    widget = await connect({ timeout: 8000, requestTimeout: 10000 })
    if (!widget.capabilities.includes('storage.get')) throw new Error('no-get')
    const read = await Promise.all(keys.map((k) => widget.storage.get(k)))
    keys.forEach((k, i) => {
      entries[k] = read[i]
      last[k] = read[i] ? read[i].value : null
    })
  } catch (error) {
    status.textContent =
      error instanceof WidgetSDKError && error.code === 'HOST_UNAVAILABLE'
        ? 'Open this page from Quillow’s block settings to edit it.'
        : 'Settings could not be loaded, so nothing can be edited right now. No data was changed.'
    status.classList.add('is-error')
    return
  }

  const values = Object.fromEntries(
    keys.map((k) => [k, entries[k] ? entries[k].value : null])
  )
  const writable =
    widget.mode === 'editor' && widget.capabilities.includes('storage.set')
  let form
  try {
    form = build(values, { writable })
  } catch (error) {
    console.error(error)
    status.textContent =
      'Saved settings look unsupported, so they were not loaded. Nothing was changed.'
    status.classList.add('is-error')
    return
  }
  const fieldset = h(
    'fieldset',
    { class: 'form-fields', disabled: !writable },
    form.el
  )
  formHost.append(fieldset)
  status.textContent = writable
    ? 'Changes apply after you save and close settings.'
    : 'Settings are read-only here.'
  saveBtn.disabled = !writable

  saveBtn.addEventListener('click', async () => {
    if (!writable || saving || locked) return
    let changes
    try {
      changes = form.serialize()
    } catch (error) {
      status.textContent = describeError(error)
      status.classList.add('is-error')
      return
    }
    saving = true
    saveBtn.disabled = true
    status.classList.remove('is-error')
    status.textContent = 'Saving…'
    try {
      for (const [key, value] of Object.entries(changes)) {
        if (last[key] === value) continue
        entries[key] = await widget.storage.set(key, value, {
          expectedRevision: entries[key]?.revision,
        })
        last[key] = value
      }
      status.textContent = 'Saved. Close settings to see your changes.'
    } catch (error) {
      // A failed mutation is never retried. Conflicts and uncertain writes lock the page
      // so a stale revision cannot overwrite someone else's data; the draft stays on screen.
      const blocking =
        error instanceof WidgetSDKError &&
        (error.mutationMayHaveSucceeded ||
          error.code === 'widget_storage_conflict' ||
          !['widget_storage_quota_exceeded', 'INVALID_ARGUMENT'].includes(
            error.code
          ))
      if (blocking) locked = true
      status.textContent = describeError(error)
      status.classList.add('is-error')
    } finally {
      saving = false
      saveBtn.disabled = locked
    }
  })
}
