// Settings shape, validation and number maths shared by the block and its settings page.
import { bool, int, isObj, oneOf, str, httpsUrl } from './kit.mjs'

export const PLATFORMS = {
  youtube: {
    name: 'YouTube',
    noun: 'Subscribers',
    short: 'Subscribers',
    brand: '#ff0033',
  },
  instagram: {
    name: 'Instagram',
    noun: 'Followers',
    short: 'Followers',
    brand: '#d62976',
  },
  tiktok: {
    name: 'TikTok',
    noun: 'Followers',
    short: 'Followers',
    brand: '#fe2c55',
  },
  x: { name: 'X', noun: 'Followers', short: 'Followers', brand: 'text' },
  facebook: {
    name: 'Facebook',
    noun: 'Followers',
    short: 'Followers',
    brand: '#1877f2',
  },
  spotify: {
    name: 'Spotify',
    noun: 'Monthly listeners',
    short: 'Listeners',
    brand: '#1db954',
  },
  linkedin: {
    name: 'LinkedIn',
    noun: 'Followers',
    short: 'Followers',
    brand: '#0a66c2',
  },
  twitch: {
    name: 'Twitch',
    noun: 'Followers',
    short: 'Followers',
    brand: '#9146ff',
  },
  substack: {
    name: 'Substack',
    noun: 'Subscribers',
    short: 'Subscribers',
    brand: '#ff6719',
  },
  custom: {
    name: 'Other / no logo',
    noun: 'Followers',
    short: 'Followers',
    brand: null,
  },
}

export const KEY = 'settings'
export const MAX_COUNT = 9_999_999_999

export const DEFAULTS = Object.freeze({
  v: 1,
  platform: 'youtube',
  count: 48200,
  label: '',
  url: '',
  format: 'full',
  brand: true,
  grow: false,
  dailyMin: 20,
  dailyMax: 30,
  asOf: 0,
})

export function normalize(raw) {
  if (!isObj(raw)) return { ...DEFAULTS }
  const dailyMin = int(raw.dailyMin, DEFAULTS.dailyMin, 0, 1_000_000)
  const dailyMax = int(raw.dailyMax, DEFAULTS.dailyMax, 0, 1_000_000)
  return {
    v: 1,
    platform: oneOf(raw.platform, Object.keys(PLATFORMS), DEFAULTS.platform),
    count: int(raw.count, DEFAULTS.count, 0, MAX_COUNT),
    label: str(raw.label, '', 40).trim(),
    url: httpsUrl(raw.url),
    format: oneOf(raw.format, ['full', 'compact'], 'full'),
    brand: bool(raw.brand, true),
    grow: bool(raw.grow, false),
    dailyMin: Math.min(dailyMin, dailyMax),
    dailyMax: Math.max(dailyMin, dailyMax),
    asOf: int(raw.asOf, 0, 0, 8.64e15),
  }
}

const DAY = 86_400_000

// Deterministic per-day gain so every visitor sees the same number.
function dailyGain(day, min, max) {
  let h = (day + 1) * 2654435761
  h ^= h >>> 15
  h = Math.imul(h, 2246822519)
  h ^= h >>> 13
  return min + ((h >>> 0) % (max - min + 1))
}

/** The displayed number: the saved count, plus (optionally) a simulated daily gain. */
export function currentCount(settings, now = Date.now()) {
  if (!settings.grow || !settings.asOf || settings.dailyMax === 0)
    return settings.count
  const elapsed = Math.max(0, now - settings.asOf)
  const day = Math.min(Math.floor(elapsed / DAY), 3650)
  let total = settings.count
  for (let d = 0; d < day; d++)
    total += dailyGain(d, settings.dailyMin, settings.dailyMax)
  const fraction = (elapsed - day * DAY) / DAY
  return (
    total +
    Math.floor(
      dailyGain(day, settings.dailyMin, settings.dailyMax) *
        Math.min(1, fraction)
    )
  )
}

export function formatCount(n, format) {
  if (format === 'compact' && n >= 10_000) {
    for (const [size, suffix] of [
      [1e9, 'B'],
      [1e6, 'M'],
      [1e3, 'K'],
    ]) {
      if (n >= size) {
        const v = n / size
        const places = v >= 100 ? 0 : 1
        const scaled = Math.floor(v * 10 ** places) / 10 ** places
        return scaled.toFixed(places).replace(/\.0$/, '') + suffix
      }
    }
  }
  return n.toLocaleString('en-US')
}
