import { bool, int, isObj, oneOf, str } from './kit.mjs'

export const KEYS = {
  settings: 'settings',
  before: 'image-before',
  after: 'image-after',
}
export const IMAGE_MAX_CHARS = 60000

export const DEFAULTS = Object.freeze({
  v: 1,
  beforeLabel: 'Before',
  afterLabel: 'After',
  showLabels: true,
  orientation: 'horizontal',
  start: 50,
  hint: true,
})

export function normalize(raw) {
  if (!isObj(raw)) return { ...DEFAULTS }
  return {
    v: 1,
    beforeLabel: str(raw.beforeLabel, DEFAULTS.beforeLabel, 24).trim(),
    afterLabel: str(raw.afterLabel, DEFAULTS.afterLabel, 24).trim(),
    showLabels: bool(raw.showLabels, true),
    orientation: oneOf(
      raw.orientation,
      ['horizontal', 'vertical'],
      'horizontal'
    ),
    start: int(raw.start, 50, 0, 100),
    hint: bool(raw.hint, true),
  }
}

// Built-in default images, shown until the owner adds their own.
export const PLACEHOLDER = {
  before: './default-before.jpg',
  after: './default-after.jpg',
}
