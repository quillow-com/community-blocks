import { addDays, ranges, weekday } from './settings.mjs'

const MINUTE = 60_000
const DAY = 1440 * MINUTE

export function zonedClock(timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  function parts(instant) {
    const p = Object.fromEntries(
      formatter.formatToParts(instant).map(({ type, value }) => [type, value])
    )
    return {
      date: `${p.year}-${p.month}-${p.day}`,
      hour: +p.hour,
      minute: +p.minute,
      second: +p.second,
    }
  }
  const wall = (instant) => {
    const p = parts(instant)
    return (
      Date.parse(`${p.date}T00:00:00Z`) +
      (p.hour * 60 + p.minute) * MINUTE +
      p.second * 1000
    )
  }
  const offsetCache = new Map()
  const instantCache = new Map()

  function instant(date, minute, edge = 'start') {
    const key = `${date}/${minute}/${edge}`
    if (instantCache.has(key)) return instantCache.get(key)
    const target = Date.parse(`${date}T00:00:00Z`) + minute * MINUTE
    if (!offsetCache.has(date)) {
      offsetCache.set(date, [
        ...new Set(
          [-36, -12, 12, 36].map((hours) => {
            const sample = Date.parse(`${date}T00:00:00Z`) + hours * 3600_000
            return wall(sample) - sample
          })
        ),
      ])
    }
    const candidates = offsetCache.get(date).map((offset) => target - offset)
    const exact = candidates.filter((candidate) => wall(candidate) === target)
    // Repeated hours: first opening, last closing. Missing hours shift forward by the DST gap.
    const result = exact.length
      ? edge === 'end'
        ? Math.max(...exact)
        : Math.min(...exact)
      : candidates
          .filter((candidate) => wall(candidate) >= target)
          .sort((a, b) => wall(a) - wall(b) || a - b)[0]
    if (!Number.isFinite(result))
      throw new Error('This local time could not be resolved.')
    instantCache.set(key, result)
    return result
  }
  return { parts, instant }
}

function merge(intervals) {
  const result = []
  for (const [start, end] of intervals.sort((a, b) => a[0] - b[0])) {
    if (end <= start) continue
    const last = result.at(-1)
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else result.push([start, end])
  }
  return result
}

export function createSchedule(settings) {
  const clock = zonedClock(settings.timeZone)
  const special = new Map(settings.exceptions.map((day) => [day.date, day]))
  const dailyCache = new Map()
  const day = (date) => special.get(date) ?? settings.week[weekday(date)]

  function intervals(date) {
    if (dailyCache.has(date)) return dailyCache.get(date)
    const start = clock.instant(date, 0)
    const end = clock.instant(addDays(date, 1), 0)
    const own = ranges(day(date)).map(([a, b]) => [
      clock.instant(date, a),
      clock.instant(
        b >= 1440 ? addDays(date, 1) : date,
        b >= 1440 ? b - 1440 : b,
        'end'
      ),
    ])
    if (!special.has(date)) {
      const previous = addDays(date, -1)
      for (const [a, b] of ranges(day(previous))) {
        if (b > 1440)
          own.push([
            clock.instant(previous, a),
            clock.instant(date, b - 1440, 'end'),
          ])
      }
    }
    const result = merge(
      own.map(([a, b]) => [Math.max(start, a), Math.min(end, b)])
    )
    dailyCache.set(date, result)
    return result
  }

  function state(now = new Date()) {
    const time = +now
    const today = clock.parts(time).date
    const current = intervals(today).find(([a, b]) => a <= time && time < b)
    const open = Boolean(current)
    let end = current?.[1]
    let ordinaryDays = 0
    let date = today
    // Eight uninterrupted ordinary days cover every weekly boundary. If the state
    // never changes, skip straight to the next special date instead of scanning years.
    for (let count = 0; count < 8 * (settings.exceptions.length + 2); count++) {
      const dayEnd = clock.instant(addDays(date, 1), 0)
      for (const [a, b] of intervals(date)) {
        if (b <= time) continue
        if (!open) return { open, today, next: a }
        if (a > end) return { open, today, next: end }
        end = Math.max(end, b)
      }
      if (open && end < dayEnd) return { open, today, next: end }
      ordinaryDays = special.has(date) ? 0 : ordinaryDays + 1
      if (ordinaryDays >= 8) {
        const future = settings.exceptions.find((item) => item.date > date)
        if (!future) return { open, today, next: null }
        date = future.date
        if (open) end = clock.instant(date, 0)
        ordinaryDays = 0
      } else date = addDays(date, 1)
    }
    return { open, today, next: null }
  }

  return {
    state,
    day,
    intervals,
    clock,
    isSpecial: (date) => special.has(date),
  }
}

export function formatTime(value, format = '24') {
  if (format === '24') return value
  const [hour, minute] = value.split(':').map(Number)
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')}${hour < 12 ? 'am' : 'pm'}`
}

export function describeDay(day, format = '24') {
  if (day.mode === 'closed') return ['Closed']
  if (day.mode === 'all-day') return ['Open 24 hours']
  return day.intervals.map(
    ({ start, end }) =>
      `${formatTime(start, format)}–${formatTime(end, format)}${end < start ? ' +1' : ''}`
  )
}

export function nextChange(state, clock, format = '24') {
  if (state.next === null)
    return state.open ? 'Open 24 hours' : 'No upcoming opening'
  const next = clock.parts(state.next)
  const time = formatTime(
    `${String(next.hour).padStart(2, '0')}:${String(next.minute).padStart(2, '0')}`,
    format
  )
  const verb = state.open ? 'Closes' : 'Opens'
  if (next.date === state.today) return `${verb} at ${time}`
  if (next.date === addDays(state.today, 1))
    return `${verb} tomorrow at ${time}`
  const distance =
    (Date.parse(`${next.date}T00:00:00Z`) -
      Date.parse(`${state.today}T00:00:00Z`)) /
    DAY
  const label = new Intl.DateTimeFormat(
    'en',
    distance < 7
      ? { weekday: 'short', timeZone: 'UTC' }
      : { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }
  ).format(new Date(`${next.date}T12:00:00Z`))
  return `${verb} ${label} at ${time}`
}
