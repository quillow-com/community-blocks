/*
MIT License

Copyright (c) 2026 Ilya Suhodolskiy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import { Quillow, connect } from './runtime.js'

if (window.parent !== window) Quillow.start()

const $ = (id) => document.getElementById(id)
const ASSETS = {
  BTC: ['Bitcoin', '₿', '#f7931a', 'btc-bitcoin'],
  ETH: ['Ethereum', 'Ξ', '#627eea', 'eth-ethereum'],
  SOL: ['Solana', '◎', '#8060da', 'sol-solana'],
  DOGE: ['Dogecoin', 'Ð', '#c4a92a', 'doge-dogecoin'],
  ADA: ['Cardano', '₳', '#306dce', 'ada-cardano'],
  XRP: ['XRP', 'X', '#252a37', 'xrp-xrp'],
  LTC: ['Litecoin', 'Ł', '#345d9d', 'ltc-litecoin'],
  AVAX: ['Avalanche', 'A', '#e84142', 'avax-avalanche'],
  DOT: ['Polkadot', '●', '#e6007a', 'dot-polkadot'],
  LINK: ['Chainlink', '⬡', '#375bd2', 'link-chainlink'],
}
const QUOTES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD']
const valid = (value) => typeof value === 'number' && Number.isFinite(value)
let selected = null
let block = null
let controller = null
let cycle = null
let disposed = false
let sequence = 0
let hasQuote = false
let openingEditor = false

function configureEmptyState() {
  if (!block || block.mode !== 'editor') return
  const button = $('open-editor')
  const hint = $('editor-hint')
  hint.hidden = false
  if (
    block.capabilities.includes('editor.open') &&
    block.editor?.available !== false
  ) {
    button.hidden = false
    button.disabled = false
    button.textContent = 'Choose pair ↗'
    hint.textContent =
      'If this button is unavailable in the grid, use the block settings gear.'
  } else {
    hint.textContent = 'Open Config using the block settings gear.'
  }
}

$('open-editor').addEventListener('click', async () => {
  if (openingEditor || !block || block.mode !== 'editor') return
  openingEditor = true
  const button = $('open-editor')
  button.disabled = true
  button.textContent = 'Opening…'
  try {
    await block.openEditor()
  } catch (error) {
    const code = error?.code || 'unknown'
    $('editor-hint').hidden = false
    $('editor-hint').textContent =
      code === 'EDITOR_UNAVAILABLE'
        ? 'Config is unavailable. Use the block settings gear.'
        : `Could not open Config (${code}). Use the block settings gear.`
  } finally {
    openingEditor = false
    button.disabled = false
    button.textContent = 'Choose pair ↗'
  }
})

function format(value, quote) {
  if (!valid(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: quote,
    maximumFractionDigits:
      Math.abs(value) >= 1 ? 2 : Math.min(8, Math.abs(value) < 0.01 ? 8 : 6),
  }).format(value)
}

function compact(value, quote) {
  if (!valid(value)) return '—'
  return (
    new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(value) + (quote === 'USD' ? '' : ` ${quote}`)
  )
}

function status(message) {
  $('state').textContent = message
}

function showScreen(kind, title = '', detail = '') {
  const overlay = $('screen')
  overlay.hidden = kind === 'none'
  overlay.dataset.kind = kind
  $('open-editor').hidden = true
  $('editor-hint').hidden = true
  $('screen-title').textContent = title
  $('screen-detail').textContent = detail
  $('loading-skeleton').hidden = kind !== 'loading'
  $('screen-message').hidden = kind === 'loading'
  $('content').hidden = kind !== 'none'
}

function graph(points, positive) {
  const root = $('chart').parentElement
  const samples = points.filter(valid)
  if (samples.length < 2) {
    root.classList.add('empty')
    return
  }
  root.classList.remove('empty')
  const low = Math.min(...samples)
  const high = Math.max(...samples)
  const range = Math.max(high - low, Math.abs(high) * 0.00001, 1e-9)
  const path = samples
    .map(
      (value, index) =>
        `${index ? 'L' : 'M'}${((index * 600) / (samples.length - 1)).toFixed(1)} ${(185 - ((value - low) / range) * 166).toFixed(1)}`
    )
    .join(' ')
  $('line').setAttribute('d', path)
  $('area').setAttribute('d', `${path} L600 200 L0 200 Z`)
  document.documentElement.style.setProperty(
    '--chart',
    positive ? '#16c75c' : '#ed5363'
  )
}

function identity() {
  const [name, icon, color] = ASSETS[selected.base]
  $('ticker').textContent = selected.base
  $('coin-subtitle').textContent = `${name} · ${selected.quote}`
  $('coin-icon').textContent = icon
  $('coin-icon').style.background = color
}

async function api(url, signal) {
  let response
  try {
    response = await fetch(url, {
      credentials: 'omit',
      mode: 'cors',
      signal,
      cache: 'no-store',
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('Connection blocked (CORS / network)')
  }
  if (!response.ok) {
    if (response.status === 429) throw new Error('Rate limit (429)')
    if (response.status === 402)
      throw new Error('API requires paid access (402)')
    throw new Error(`HTTP ${response.status}`)
  }
  try {
    return await response.json()
  } catch {
    throw new Error('Invalid API response')
  }
}

function displayQuote({ price, pct, change, volume, cap, updated }, quote) {
  const positive = (pct ?? change ?? 0) >= 0
  $('price').textContent = format(price, quote)
  $('delta').className =
    `delta ${pct == null ? 'muted' : positive ? 'positive' : 'negative'}`
  $('delta').textContent =
    pct == null
      ? '24h change unavailable'
      : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` +
        (change == null
          ? ''
          : ` · ${change >= 0 ? '+' : ''}${format(change, quote)}`)
  $('volume').textContent = compact(volume, quote)
  $('cap').textContent = compact(cap, quote)
  $('high').textContent = '—'
  $('low').textContent = '—'
  $('source-pill').textContent = 'LIVE'
  const when =
    updated && Number.isFinite(Date.parse(updated)) ? new Date(updated) : null
  status(
    `CoinPaprika${when ? ` · ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ' · live quote'}`
  )
  return positive
}

async function paprika(base, quote, signal) {
  const url = new URL(
    `https://api.coinpaprika.com/v1/tickers/${ASSETS[base][3]}`
  )
  url.searchParams.set('quotes', quote)
  const body = await api(url, signal)
  const result = body?.quotes?.[quote]
  if (!result || !valid(result.price) || result.price <= 0)
    throw new Error('Quote unavailable from CoinPaprika')
  const pct = valid(result.percent_change_24h)
    ? result.percent_change_24h
    : null
  return {
    price: result.price,
    pct,
    change:
      pct === null || pct <= -100
        ? null
        : result.price - result.price / (1 + pct / 100),
    volume: result.volume_24h,
    cap: result.market_cap,
    updated: body.last_updated,
  }
}

async function history(base, quote, signal, positive) {
  const url = new URL(
    `https://api.coinpaprika.com/v1/tickers/${ASSETS[base][3]}/historical`
  )
  url.searchParams.set(
    'start',
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  )
  url.searchParams.set('interval', '1h')
  url.searchParams.set('quote', quote)
  const data = await api(url, signal)
  const samples = Array.isArray(data)
    ? data.filter((sample) => valid(sample?.price) && sample.price > 0)
    : []
  if (samples.length < 2) throw new Error('No historical prices returned')
  graph(
    samples.map((sample) => sample.price),
    positive
  )
  $('high').textContent = format(
    Math.max(...samples.map((sample) => sample.price)),
    quote
  )
  $('low').textContent = format(
    Math.min(...samples.map((sample) => sample.price)),
    quote
  )
}

async function refresh() {
  if (!selected || disposed) return
  const token = ++sequence
  controller?.abort()
  controller = new AbortController()
  const { signal } = controller
  const { base, quote } = selected
  if (!hasQuote)
    showScreen(
      'loading',
      'Loading market data',
      `Fetching ${base}/${quote} from CoinPaprika…`
    )
  else status('Updating…')
  let result
  try {
    result = await paprika(base, quote, signal)
  } catch (error) {
    if (signal.aborted || token !== sequence) return
    if (!hasQuote)
      showScreen('error', 'Price unavailable', `CoinPaprika: ${error.message}`)
    else {
      status('Update failed · showing last received price')
      $('source-pill').textContent = 'STALE'
    }
    return
  }
  if (token !== sequence || signal.aborted || disposed) return
  identity()
  const positive = displayQuote(result, quote)
  hasQuote = true
  $('chart').parentElement.classList.add('empty')
  $('no-history').textContent = 'Loading 24h history…'
  showScreen('none')
  // History is optional and must never block the initial quote rendering.
  try {
    await history(base, quote, signal, positive)
  } catch {
    if (signal.aborted || token !== sequence || disposed) return
    $('chart').parentElement.classList.add('empty')
    $('no-history').textContent = '24h history unavailable'
  }
}

function parseSettings(raw) {
  try {
    if (typeof raw !== 'string') return null
    const value = JSON.parse(raw)
    return value &&
      typeof value === 'object' &&
      Object.hasOwn(ASSETS, value.base) &&
      QUOTES.includes(value.quote)
      ? { base: value.base, quote: value.quote }
      : null
  } catch {
    return null
  }
}

async function init() {
  showScreen('loading', 'Loading settings', 'Reading saved pair…')
  // A standalone development preview is read-only and never writes saved settings.
  if (window.parent === window) {
    selected = { base: 'BTC', quote: 'USD' }
  } else {
    try {
      block = await connect({ timeout: 6500 })
      if (disposed) {
        block.destroy()
        return
      }
      if (!block.capabilities.includes('storage.get')) {
        showScreen(
          'error',
          'Storage unavailable',
          'Quillow has not granted storage access.'
        )
        return
      }
      const entry = await block.storage.get('crypto.settings')
      selected = parseSettings(entry?.value)
    } catch {
      if (disposed) return
      showScreen(
        'error',
        'Cannot read settings',
        'Reconnect the block to Quillow and try again.'
      )
      return
    }
  }
  if (disposed) return
  if (!selected) {
    if (block.mode === 'editor') {
      showScreen(
        'empty',
        'Choose a crypto pair',
        'Select a coin and currency to get live prices.'
      )
      configureEmptyState()
    } else
      showScreen(
        'empty',
        'Not configured',
        'The owner has not selected a crypto pair yet.'
      )
    return
  }
  void refresh()
  cycle = setInterval(() => {
    if (!document.hidden) void refresh()
  }, 120000)
}

window.addEventListener('pagehide', () => {
  disposed = true
  controller?.abort()
  clearInterval(cycle)
  block?.destroy()
  Quillow.destroy()
})

void init()
