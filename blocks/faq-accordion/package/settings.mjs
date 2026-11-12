import { bool, int, isObj, str } from './kit.mjs'

export const KEY = 'settings'
export const MAX_ITEMS = 30
export const LIMITS = { title: 80, q: 160, a: 1000 }

export const DEFAULTS = Object.freeze({
  v: 1,
  title: 'Frequently asked questions',
  firstOpen: false,
  items: [
    {
      q: 'How does it work?',
      a: 'Add your own questions and answers in the block settings. They appear here as soon as you save.',
    },
    {
      q: 'Can I change the questions later?',
      a: 'Yes. Open the settings at any time to add, reorder or remove questions.',
    },
    {
      q: 'Does it match my page?',
      a: 'The block picks up your page’s colours, font and corner style automatically.',
    },
    {
      q: 'Will it work on mobile?',
      a: 'Yes. Questions and answers are laid out to suit every block size.',
    },
  ],
})

export function normalize(raw) {
  if (!isObj(raw))
    return { ...DEFAULTS, items: DEFAULTS.items.map((i) => ({ ...i })) }
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .filter(isObj)
    .map((i) => ({
      q: str(i.q, '', LIMITS.q).trim(),
      a: str(i.a, '', LIMITS.a).trim(),
    }))
    .filter((i) => i.q)
    .slice(0, MAX_ITEMS)
  return {
    v: 1,
    title: str(raw.title, DEFAULTS.title, LIMITS.title).trim(),
    firstOpen: bool(raw.firstOpen, false),
    items,
  }
}
