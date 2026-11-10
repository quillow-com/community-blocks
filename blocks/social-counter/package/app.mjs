import { loadStored, parseJSON, startTheme, reduceMotion } from './kit.mjs'
import {
  KEY,
  PLATFORMS,
  normalize,
  currentCount,
  formatCount,
} from './settings.mjs'

startTheme()

// Simplified platform marks, drawn in a 24 x 24 box.
const LOGOS = {
  youtube:
    '<rect x="1" y="4" width="22" height="16" rx="5" fill="#ff0033"/><path d="M10 8.8v6.4l5.4-3.2z" fill="#fff"/>',
  instagram:
    '<defs><linearGradient id="ig" x1="0.1" y1="1" x2="0.9" y2="0"><stop offset="0" stop-color="#fdb750"/><stop offset="0.45" stop-color="#e1306c"/><stop offset="1" stop-color="#6a4fd8"/></linearGradient></defs><rect x="1.5" y="1.5" width="21" height="21" rx="6.2" fill="url(#ig)"/><rect x="5.6" y="5.6" width="12.8" height="12.8" rx="4" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="16.3" cy="7.7" r="1" fill="#fff"/>',
  tiktok:
    '<g fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path transform="translate(-0.9 0.7)" stroke="#25f4ee" d="M14.2 3.5v10.3a3.6 3.6 0 1 1-3.6-3.6M14.2 3.5c.3 2.4 2 4.3 4.6 4.5"/><path transform="translate(0.9 -0.5)" stroke="#fe2c55" d="M14.2 3.5v10.3a3.6 3.6 0 1 1-3.6-3.6M14.2 3.5c.3 2.4 2 4.3 4.6 4.5"/><path stroke="currentColor" d="M14.2 3.5v10.3a3.6 3.6 0 1 1-3.6-3.6M14.2 3.5c.3 2.4 2 4.3 4.6 4.5"/></g>',
  x: '<path d="M4 3.5h4.3L20 20.5h-4.3z" fill="currentColor"/><path d="M19.6 3.5 4.6 20.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" fill="none"/>',
  facebook:
    '<circle cx="12" cy="12" r="11" fill="#1877f2"/><path d="M13.2 21v-7.3h2.4l.4-2.8h-2.8V9.1c0-.8.3-1.4 1.5-1.4H16V5.2c-.3 0-1.1-.1-2.1-.1-2.1 0-3.5 1.3-3.5 3.6v2.2H8v2.8h2.4V21z" fill="#fff"/>',
  spotify:
    '<circle cx="12" cy="12" r="11" fill="#1db954"/><g fill="none" stroke="#0b0b0b" stroke-linecap="round"><path stroke-width="2" d="M6 9.2c4-1.1 8.1-.8 11.7 1.3"/><path stroke-width="1.7" d="M6.7 12.6c3.4-.9 6.6-.6 9.6 1.1"/><path stroke-width="1.4" d="M7.3 15.8c2.8-.7 5.3-.4 7.7.9"/></g>',
  linkedin:
    '<rect x="1.5" y="1.5" width="21" height="21" rx="4.5" fill="#0a66c2"/><circle cx="7.3" cy="7.7" r="1.6" fill="#fff"/><rect x="5.9" y="10.2" width="2.8" height="7.8" fill="#fff"/><path d="M10.6 10.2h2.7v1.1c.5-.8 1.4-1.3 2.6-1.3 2.3 0 3 1.5 3 3.5V18h-2.8v-4.2c0-1-.3-1.7-1.3-1.7-1.1 0-1.4.8-1.4 1.8V18h-2.8z" fill="#fff"/>',
  twitch:
    '<path d="M4.2 2.5h17v11.7l-4.4 4.4h-4l-3.1 3.1v-3.1H4.2z" fill="#9146ff"/><rect x="11.2" y="6.8" width="1.9" height="5.2" fill="#fff"/><rect x="15.6" y="6.8" width="1.9" height="5.2" fill="#fff"/>',
  substack:
    '<path d="M4 3.5h16v2.4H4zM4 8h16v2.4H4zM4 12.5h16V22l-8-4.6L4 22z" fill="#ff6719"/>',
  custom:
    '<circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 5.2a3.2 3.2 0 0 1 0 6M18 14.8c1.8.7 3 2.3 3 5.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
}

const $ = (id) => document.getElementById(id)
const counter = $('counter')
const valueEl = $('value')
const reduced = reduceMotion()

let strips = []
let shape = ''
let settings = normalize(null)
let current = 0

function build(formatted) {
  valueEl.textContent = ''
  strips = []
  for (const ch of formatted) {
    if (/\d/.test(ch)) {
      const digit = document.createElement('span')
      const strip = document.createElement('span')
      digit.className = 'digit'
      strip.className = 'digit__strip'
      digit.setAttribute('aria-hidden', 'true')
      for (let n = 0; n <= 9; n++) {
        const cell = document.createElement('span')
        cell.textContent = n
        strip.append(cell)
      }
      digit.append(strip)
      valueEl.append(digit)
      strips.push(strip)
    } else {
      const el = document.createElement('span')
      el.className = ch === ',' || ch === '.' ? 'sep' : 'suffix'
      el.textContent = ch
      el.setAttribute('aria-hidden', 'true')
      valueEl.append(el)
    }
  }
  shape = formatted.replace(/\d/g, '0')
}

function show(formatted, stagger = 0) {
  const digits = formatted.replace(/\D/g, '')
  strips.forEach((strip, i) => {
    strip.style.transitionDelay = reduced
      ? '0s'
      : `${(strips.length - 1 - i) * stagger}ms`
    strip.style.transform = `translateY(${-Number(digits[i]) * 10}%)`
  })
}

function setLabel(n) {
  valueEl.setAttribute(
    'aria-label',
    `${n.toLocaleString('en-US')} ${labelText().toLowerCase()}`
  )
}

function labelText() {
  const p = PLATFORMS[settings.platform]
  return settings.label || p.noun
}

// Widest digit advance (in em) for the font currently in use, so wide faces are never clipped by the fixed-width cell.
let probe = null
function digitWidthEm() {
  if (!probe) {
    probe = document.createElement('span')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText =
      'position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap;font-size:100px;letter-spacing:0;left:0;top:0'
    probe.innerHTML = [...'0123456789']
      .map((d) => `<span style="display:inline-block">${d}</span>`)
      .join('')
  }
  valueEl.append(probe)
  const widest = Math.max(
    ...[...probe.children].map((c) => c.getBoundingClientRect().width)
  )
  probe.remove()
  return Math.max(0.62, widest / 100 + 0.03)
}

// Fit the number to the space, per block size.
function fit() {
  const dw = digitWidthEm()
  counter.style.setProperty('--dw', `${dw}em`)
  const size =
    document.documentElement.dataset.quillowSize ||
    (innerWidth <= 220 && innerHeight <= 220
      ? '1:1'
      : innerHeight <= 220
        ? '2:1'
        : '2:2')
  const cap = { '1:1': 40, '2:1': 52, '2:2': 68 }[size] ?? 52
  const chars = [...valueEl.children]
  const emWidth =
    chars.reduce(
      (sum, el) =>
        sum +
        (el.classList.contains('digit')
          ? dw
          : el.classList.contains('sep')
            ? 0.28
            : 0.82),
      0
    ) || 1
  // Measure the grid cell rather than the number itself, which depends on font-size.
  const cell = valueEl.parentElement.getBoundingClientRect()
  const pad = parseFloat(getComputedStyle(counter).paddingLeft) * 2
  const availW = cell.width - pad
  const head = $('logo').getBoundingClientRect().height
  const foot = counter
    .querySelector('.counter__cta')
    .getBoundingClientRect().height
  const availH = cell.height - pad - head - foot - 8
  const digit = Math.max(
    16,
    Math.min(cap, availW / emWidth, (availH / 1.4) * 0.96)
  )
  counter.style.setProperty('--digit', `${Math.floor(digit)}px`)
}

function applyChrome() {
  const p = PLATFORMS[settings.platform]
  $('logo').innerHTML =
    `<svg viewBox="0 0 24 24" focusable="false">${LOGOS[settings.platform]}</svg>`
  const brand =
    settings.brand && p.brand
      ? p.brand === 'text'
        ? 'var(--qb-text)'
        : p.brand
      : 'var(--qb-accent)'
  counter.style.setProperty('--brand', brand)
  const label = settings.label
  $('cta-long').textContent = label || `Current ${p.noun.toLowerCase()}`
  $('cta-short').textContent = label || p.short
  if (settings.url) {
    counter.href = settings.url
    counter.target = '_top'
    counter.setAttribute('aria-label', `${p.name}: ${labelText()}`)
  } else {
    counter.removeAttribute('href')
    counter.removeAttribute('target')
    counter.removeAttribute('aria-label')
  }
}

function render(n, stagger, unavailable = false) {
  const formatted = unavailable ? '' : formatCount(n, settings.format)
  if (unavailable) {
    valueEl.textContent = '—'
    valueEl.setAttribute('aria-label', 'Count unavailable')
    return
  }
  if (formatted.replace(/\d/g, '0') !== shape || strips.length === 0)
    build(formatted)
  fit()
  show(formatted, stagger)
  setLabel(n)
}

async function start() {
  const { status, values } = await loadStored([KEY])
  settings = normalize(parseJSON(values[KEY]))
  applyChrome()
  const unavailable = status === 'unavailable'
  document.body.setAttribute('data-ready', '')
  if (unavailable) {
    render(0, 0, true)
    return
  }
  current = currentCount(settings)
  // Start every digit at 0, then roll up to the real value.
  build(formatCount(current, settings.format))
  fit()
  strips.forEach((s) => {
    s.style.transition = 'none'
    s.style.transform = 'translateY(0)'
  })
  valueEl.getBoundingClientRect()
  strips.forEach((s) => {
    s.style.transition = ''
  })
  requestAnimationFrame(() => {
    show(formatCount(current, settings.format), 70)
    setLabel(current)
  })

  if (settings.grow) {
    setInterval(() => {
      const next = currentCount(settings)
      if (next === current) return
      current = next
      render(current, 40)
    }, 30_000)
  }
}

new ResizeObserver(() => strips.length && fit()).observe(document.body)
// Web fonts arrive after first paint; re-measure once they do.
document.fonts?.addEventListener?.('loadingdone', () => strips.length && fit())
document.fonts?.ready?.then(() => strips.length && fit())
new MutationObserver(() => strips.length && fit()).observe(
  document.documentElement,
  {
    attributes: true,
    attributeFilter: ['data-quillow-size'],
  }
)
void start()
