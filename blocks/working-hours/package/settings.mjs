export const KEY = 'settings'
export const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]
export const MAX_INTERVALS = 3
export const MAX_EXCEPTIONS = 60
export const LIMITS = { title: 80, note: 160, label: 60 }

export const DEFAULTS = {
  v: 1,
  title: 'Working Hours',
  note: '',
  timeZone: 'UTC',
  timeFormat: '24',
  week: DAYS.map((_, i) => ({
    mode: i === 6 ? 'closed' : 'hours',
    intervals:
      i === 6
        ? []
        : [
            {
              start: i === 5 ? '10:00' : '09:00',
              end: i >= 4 ? '22:00' : '18:00',
            },
          ],
  })),
  exceptions: [],
}

export const clone = (value) => JSON.parse(JSON.stringify(value))
const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export function minutes(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    return null
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
}

export function validDate(value) {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value) ||
    value > '9998-12-31'
  )
    return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value
}

export function addDays(date, count) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + count)
  return value.toISOString().slice(0, 10)
}

export const weekday = (date) =>
  (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7

export function validTimeZone(value) {
  if (
    typeof value !== 'string' ||
    value.length > 100 ||
    !/^[A-Za-z0-9_+\-/]+$/.test(value)
  )
    return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0)
    return true
  } catch {
    return false
  }
}

export function ranges(day) {
  if (day.mode === 'closed') return []
  if (day.mode === 'all-day') return [[0, 1440]]
  return day.intervals
    .map(({ start, end }) => {
      const a = minutes(start)
      const b = minutes(end)
      return [a, b <= a ? b + 1440 : b]
    })
    .sort((a, b) => a[0] - b[0])
}

function checkDay(day, name) {
  if (!object(day) || !['closed', 'all-day', 'hours'].includes(day.mode))
    throw new Error(`${name}: choose scheduled hours, open 24 hours or closed.`)
  if (!Array.isArray(day.intervals) || day.intervals.length > MAX_INTERVALS)
    throw new Error(`${name}: use at most ${MAX_INTERVALS} intervals.`)
  if (day.mode !== 'hours') return
  if (!day.intervals.length)
    throw new Error(`${name}: add an interval or choose Closed.`)
  for (const interval of day.intervals) {
    if (
      !object(interval) ||
      minutes(interval.start) === null ||
      minutes(interval.end) === null
    )
      throw new Error(`${name}: enter a valid start and end time.`)
    if (interval.start === interval.end)
      throw new Error(
        `${name}: start and end are the same. Choose Open 24 hours instead.`
      )
  }
  const sorted = ranges(day)
  if (sorted.some((range, i) => i > 0 && range[0] < sorted[i - 1][1]))
    throw new Error(`${name}: time intervals overlap.`)
}

function checkSpill(day, next, name) {
  const spill = ranges(day).filter(([, end]) => end > 1440)
  if (
    spill.some(([start, end]) =>
      ranges(next).some(([a, b]) => a < end - 1440 && b > start - 1440)
    )
  )
    throw new Error(
      `${name}: overnight hours overlap the following day's hours.`
    )
}

export function validate(value) {
  if (!object(value) || value.v !== 1)
    throw new Error('Unsupported settings version.')
  for (const key of ['title', 'note']) {
    if (typeof value[key] !== 'string' || value[key].length > LIMITS[key])
      throw new Error(`${key === 'title' ? 'Title' : 'Note'} is too long.`)
  }
  if (!validTimeZone(value.timeZone))
    throw new Error('Choose a valid business time zone, such as Europe/Berlin.')
  if (!['12', '24'].includes(value.timeFormat))
    throw new Error('Choose a 12- or 24-hour clock.')
  if (!Array.isArray(value.week) || value.week.length !== 7)
    throw new Error('The schedule must contain all seven days.')
  value.week.forEach((day, i) => checkDay(day, DAYS[i]))
  value.week.forEach((day, i) =>
    checkSpill(day, value.week[(i + 1) % 7], DAYS[i])
  )
  if (
    !Array.isArray(value.exceptions) ||
    value.exceptions.length > MAX_EXCEPTIONS
  )
    throw new Error(`Use at most ${MAX_EXCEPTIONS} special dates.`)
  const dates = new Set()
  for (const day of value.exceptions) {
    if (!object(day) || !validDate(day.date))
      throw new Error('Choose a valid date for every special date.')
    if (dates.has(day.date))
      throw new Error(
        `${day.date}: there is already a special schedule for this date.`
      )
    dates.add(day.date)
    if (typeof day.label !== 'string' || day.label.length > LIMITS.label)
      throw new Error(`${day.date}: the label is too long.`)
    checkDay(day, day.date)
  }
  for (const day of value.exceptions) {
    const nextDate = addDays(day.date, 1)
    // A special date replaces the whole civil day, including incoming overnight hours.
    if (!dates.has(nextDate))
      checkSpill(day, value.week[weekday(nextDate)], day.date)
  }
  return value
}

export function normalize(raw) {
  const value =
    raw === null || raw === undefined ? clone(DEFAULTS) : clone(validate(raw))
  for (const day of [...value.week, ...value.exceptions]) {
    day.intervals =
      day.mode === 'hours'
        ? day.intervals
            .map(({ start, end }) => ({ start, end }))
            .sort((a, b) => minutes(a.start) - minutes(b.start))
        : []
  }
  value.title = value.title.trim()
  value.note = value.note.trim()
  value.exceptions.sort((a, b) => a.date.localeCompare(b.date))
  return value
}
