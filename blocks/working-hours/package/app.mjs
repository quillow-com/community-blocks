import {
  Quillow,
  blockSize,
  el,
  loadStored,
  onSizeChange,
  startTheme,
  unavailableText,
} from './kit.mjs'
import { addDays, DAYS, KEY, normalize, weekday } from './settings.mjs'
import {
  createSchedule,
  describeDay,
  formatTime,
  nextChange,
} from './schedule.mjs'

startTheme()
const root = document.getElementById('hours')
let settings
let schedule
let unavailable = false
let errorCode = ''
let timer
let lastDay = ''
let disposed = false

function hours(day, className = '') {
  return el(
    'div',
    { class: `times ${className}` },
    describeDay(day, settings.timeFormat).map((text) =>
      el(
        'span',
        {
          'aria-label': text.endsWith(' +1')
            ? text.replace(' +1', ', next day')
            : null,
        },
        text
      )
    )
  )
}

function todayHours(state) {
  const time = (instant) => {
    const p = schedule.clock.parts(instant)
    return formatTime(
      `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`,
      settings.timeFormat
    )
  }
  const start = schedule.clock.instant(state.today, 0)
  const end = schedule.clock.instant(addDays(state.today, 1), 0)
  const remaining = schedule
    .intervals(state.today)
    .filter(([, b]) => b > Date.now())
  const labels = remaining.map(([a, b]) =>
    a === start && b === end
      ? 'Open 24 hours'
      : `${time(a)}–${b === end && settings.timeFormat === '24' ? '24:00' : time(b)}`
  )
  return el(
    'div',
    {},
    el('div', { class: 'times' }, el('span', {}, labels[0] || 'Closed')),
    labels.length > 1
      ? el('p', { class: 'more-today' }, `+${labels.length - 1} later today`)
      : null
  )
}

function render() {
  if (disposed) return
  const size = blockSize()
  root.dataset.size = size
  if (unavailable) {
    root.replaceChildren(
      el(
        'p',
        { class: 'empty', role: 'status' },
        unavailableText('Working hours', errorCode)
      )
    )
    return
  }
  if (!schedule) return
  const state = schedule.state(new Date())
  // Bound caches to the current business day, including after a system-clock change.
  if (lastDay && lastDay !== state.today) schedule = createSchedule(settings)
  lastDay = state.today
  const today = schedule.day(state.today)
  const heading = el(
    'div',
    { class: 'summary', role: 'status', 'aria-live': 'polite' },
    el(
      'p',
      { class: `status-line ${state.open ? 'is-open' : 'is-closed'}` },
      el('span', { class: 'status-dot', 'aria-hidden': 'true' }),
      state.open ? 'Open now' : 'Closed now'
    ),
    el(
      'p',
      { class: 'next-change' },
      nextChange(state, schedule.clock, settings.timeFormat)
    )
  )
  const specialText = schedule.isSpecial(state.today)
    ? today.label || 'Special hours'
    : ''
  const todayPanel = el(
    'section',
    { class: 'today', 'aria-label': "Today's hours" },
    el(
      'p',
      { class: 'day-label' },
      `Today · ${DAYS[weekday(state.today)].slice(0, 3)}`
    ),
    todayHours(state),
    specialText ? el('p', { class: 'special-label' }, specialText) : null
  )

  if (size === '1:1') {
    root.replaceChildren(heading, todayPanel)
  } else if (size === '2:1') {
    root.replaceChildren(
      heading,
      todayPanel,
      el('p', { class: 'zone' }, settings.timeZone.replaceAll('_', ' '))
    )
  } else {
    const monday = addDays(state.today, -weekday(state.today))
    const rows = DAYS.map((name, i) => {
      const date = addDays(monday, i)
      const isToday = date === state.today
      const isSpecial = schedule.isSpecial(date)
      const day = schedule.day(date)
      return el(
        'li',
        {
          class: `week-row${isToday ? ' is-today' : ''}`,
          'aria-current': isToday ? 'date' : null,
        },
        el(
          'div',
          { class: 'week-day' },
          el('span', {}, name),
          isSpecial
            ? el(
                'span',
                { class: 'special-label' },
                day.label || 'Special hours'
              )
            : null
        ),
        hours(day)
      )
    })
    const list = el(
      'ul',
      {
        class: 'week',
        tabindex: '0',
        'aria-label': 'This week, in the business time zone',
      },
      rows
    )
    const previousList = root.querySelector('.week')
    const scrollTop = previousList?.scrollTop ?? 0
    const focused = previousList && document.activeElement === previousList
    root.replaceChildren(
      el(
        'header',
        { class: 'heading' },
        settings.title ? el('h1', {}, settings.title) : null,
        heading
      ),
      list,
      el(
        'footer',
        {},
        settings.note ? el('p', { class: 'note' }, settings.note) : null,
        el(
          'p',
          { class: 'zone' },
          settings.timeZone.replaceAll('_', ' '),
          settings.week.some((day) =>
            day.intervals.some((interval) => interval.end < interval.start)
          ) ||
            settings.exceptions.some((day) =>
              day.intervals.some((interval) => interval.end < interval.start)
            )
            ? ' · +1 next day'
            : ''
        )
      )
    )
    list.scrollTop = scrollTop
    if (focused) list.focus({ preventScroll: true })
  }
}

function tick() {
  clearTimeout(timer)
  if (!document.hidden) render()
  timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50)
}

async function start() {
  const result = await loadStored([KEY])
  if (disposed) return
  unavailable = result.status === 'unavailable'
  errorCode = result.code ?? ''
  try {
    settings = normalize(
      result.values[KEY] == null ? null : JSON.parse(result.values[KEY])
    )
    // JSON null is not a missing record and must not masquerade as default hours.
    if (result.values[KEY] != null && JSON.parse(result.values[KEY]) === null)
      throw new Error('invalid')
    schedule = createSchedule(settings)
  } catch {
    unavailable = true
    errorCode = 'INVALID_SETTINGS'
  }
  tick()
  document.body.setAttribute('data-ready', '')
}

onSizeChange(render)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tick()
})
window.addEventListener(
  'pagehide',
  () => {
    disposed = true
    clearTimeout(timer)
    Quillow.destroy()
  },
  { once: true }
)
void start()
