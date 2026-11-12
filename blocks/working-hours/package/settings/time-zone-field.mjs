import { validTimeZone } from '../settings.mjs'
import { button, h } from './editor-kit.mjs'

// Older browsers without supportedValuesOf still offer common zones and retain
// the saved/device zone. Modern browsers supply their complete IANA zone list.
const COMMON_ZONES = [
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'America/Argentina/Buenos_Aires',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Sao_Paulo',
  'America/Toronto',
  'Asia/Bangkok',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Kolkata',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/Istanbul',
  'Europe/Kyiv',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Moscow',
  'Europe/Paris',
  'Europe/Rome',
  'Pacific/Auckland',
  'Pacific/Honolulu',
]

export function timeZoneLabel(value) {
  const city =
    value === 'UTC'
      ? 'Coordinated Universal Time'
      : value.split('/').at(-1).replaceAll('_', ' ')
  return { value, city, label: `${city} · ${value}` }
}

export function timeZoneOptions(
  saved,
  local,
  available = Intl.supportedValuesOf?.('timeZone') ?? COMMON_ZONES
) {
  const values = new Set(['UTC', ...available.filter(validTimeZone)])
  // Valid aliases absent from supportedValuesOf must survive opening and saving.
  for (const value of [saved, local])
    if (validTimeZone(value)) values.add(value)
  return [...values]
    .map(timeZoneLabel)
    .sort((a, b) =>
      a.value === 'UTC'
        ? -1
        : b.value === 'UTC'
          ? 1
          : a.city.localeCompare(b.city) || a.value.localeCompare(b.value)
    )
}

const searchText = (value) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[_/.-]+/g, ' ')
    .toLowerCase()

export function filterTimeZones(options, query) {
  const words = searchText(query).trim().split(/\s+/).filter(Boolean)
  return options.filter((option) =>
    words.every((word) => searchText(option.label).includes(word))
  )
}

let fieldId = 0

export function timeZoneField({ value, onChange }) {
  const id = `time-zone-${++fieldId}`
  let selected = value
  let options = timeZoneOptions(
    value,
    Intl.DateTimeFormat().resolvedOptions().timeZone
  )
  let matches = options
  let active = -1
  let opened = false
  let restoringFocus = false
  const input = h('input', {
    id,
    type: 'text',
    role: 'combobox',
    value: timeZoneLabel(value).label,
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': `${id}-list`,
    'aria-describedby': `${id}-hint`,
  })
  const list = h('div', {
    id: `${id}-list`,
    role: 'listbox',
    'aria-label': 'Business time zones',
    class: 'zone-options',
  })
  const message = h('p', {
    class: 'zone-message',
    role: 'status',
    'aria-live': 'polite',
  })
  const popup = h('div', { class: 'zone-popup', hidden: true }, list, message)
  const toggle = button('▾', {
    class: 'zone-toggle',
    'aria-label': 'Show time zones',
    'aria-haspopup': 'listbox',
    'aria-controls': `${id}-list`,
    'aria-expanded': 'false',
    // Keep input focus: Safari otherwise blurs before click and reopens the menu.
    onPointerdown: (event) => event.preventDefault(),
    onClick: () => {
      if (opened) close()
      else {
        focusInput()
        open()
      }
    },
  })
  const root = h(
    'div',
    { class: 'field time-zone-field' },
    h('label', { for: id, class: 'field-label' }, 'Business time zone'),
    h('div', { class: 'zone-control' }, input, toggle, popup),
    h(
      'p',
      { id: `${id}-hint`, class: 'field-hint' },
      'Search a city or IANA time zone, then select a result. All hours use the business time zone.'
    )
  )

  function focusInput() {
    restoringFocus = true
    input.focus({ preventScroll: true })
    input.select()
    restoringFocus = false
  }

  function highlight(index, scroll = true) {
    active = index
    for (const [i, option] of [...list.children].entries())
      option.classList.toggle('is-active', i === index)
    const option = list.children[index]
    if (option) {
      input.setAttribute('aria-activedescendant', option.id)
      if (scroll) option.scrollIntoView({ block: 'nearest' })
    } else input.removeAttribute('aria-activedescendant')
  }

  function close() {
    opened = false
    popup.hidden = true
    input.value = timeZoneLabel(selected).label
    input.setAttribute('aria-expanded', 'false')
    toggle.setAttribute('aria-expanded', 'false')
    input.removeAttribute('aria-activedescendant')
  }

  function choose(zone) {
    selected = zone
    onChange(zone)
    close()
    focusInput()
  }

  function open(query = '') {
    opened = true
    popup.hidden = false
    input.setAttribute('aria-expanded', 'true')
    toggle.setAttribute('aria-expanded', 'true')
    matches = filterTimeZones(options, query)
    list.replaceChildren(
      ...matches.map((zone, index) =>
        button(
          [
            h('span', { class: 'zone-city' }, zone.city),
            h('span', { class: 'zone-id' }, zone.value),
          ],
          {
            id: `${id}-option-${index}`,
            class: 'zone-option',
            role: 'option',
            tabindex: '-1',
            'aria-selected': String(zone.value === selected),
            onClick: () => choose(zone.value),
            onMousemove: () => highlight(index, false),
          }
        )
      )
    )
    message.textContent = matches.length
      ? `${matches.length} time zones`
      : 'No time zones found. Try another city or zone name.'
    const selectedIndex = matches.findIndex((zone) => zone.value === selected)
    highlight(matches.length ? Math.max(0, selectedIndex) : -1)
  }

  input.addEventListener('focus', () => {
    if (restoringFocus) return
    open()
    input.select()
  })
  input.addEventListener('input', () => open(input.value))
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!opened) {
        open()
        return
      }
      if (matches.length)
        highlight(
          (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) %
            matches.length
        )
    } else if (opened && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault()
      highlight(
        matches.length ? (event.key === 'Home' ? 0 : matches.length - 1) : -1
      )
    } else if (opened && event.key === 'Enter') {
      event.preventDefault()
      if (matches[active]) choose(matches[active].value)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'Tab') close()
  })
  root.addEventListener('focusout', (event) => {
    if (!root.contains(event.relatedTarget)) close()
  })
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && event.target !== input) {
      close()
      focusInput()
    }
  })
  document.addEventListener('pointerdown', (event) => {
    if (opened && !root.contains(event.target)) close()
  })

  return {
    el: root,
    set(zone) {
      if (!validTimeZone(zone)) return
      selected = zone
      options = timeZoneOptions(
        zone,
        Intl.DateTimeFormat().resolvedOptions().timeZone
      )
      close()
    },
  }
}
