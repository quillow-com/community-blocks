import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addDays,
  clone,
  DEFAULTS,
  normalize,
  validDate,
  validTimeZone,
} from '../package/settings.mjs'
import {
  createSchedule,
  describeDay,
  formatTime,
  nextChange,
  zonedClock,
} from '../package/schedule.mjs'

const closed = () => ({ mode: 'closed', intervals: [] })
const allDay = () => ({ mode: 'all-day', intervals: [] })
const hours = (...pairs) => ({
  mode: 'hours',
  intervals: pairs.map(([start, end]) => ({ start, end })),
})
const settings = (patch = {}) => normalize({ ...clone(DEFAULTS), ...patch })
const state = (data, date) => createSchedule(data).state(new Date(date))
const iso = (value) => (value === null ? null : new Date(value).toISOString())

test('defaults are independently editable; invalid or future-version storage is rejected', () => {
  const a = normalize(null)
  a.week[0].intervals[0].start = '01:00'
  assert.equal(normalize(null).week[0].intervals[0].start, '09:00')
  for (const value of [{}, [], 'text', 3, { ...clone(DEFAULTS), v: 2 }])
    assert.throws(() => normalize(value))
})

test('validates dates, IANA time zones, invalid times, and exact week shape', () => {
  assert.equal(validDate('2028-02-29'), true)
  assert.equal(validDate('2026-02-29'), false)
  assert.equal(validDate('2026-04-31'), false)
  assert.equal(validTimeZone('Etc/GMT+5'), true)
  assert.equal(validTimeZone('Europe/NotReal'), false)
  assert.equal(validTimeZone('+02:00'), false)
  assert.equal(addDays('2028-02-28', 2), '2028-03-01')
  for (const day of [
    hours(['25:00', '18:00']),
    hours(['09:00', '09:00']),
    hours(),
  ]) {
    assert.throws(() =>
      settings({ week: [day, ...Array.from({ length: 6 }, closed)] })
    )
  }
  assert.throws(() => settings({ week: [] }))
})

test('sorts split shifts and rejects overlaps, including the Sunday/Monday boundary', () => {
  const week = Array.from({ length: 7 }, closed)
  week[0] = hours(['16:00', '22:00'], ['09:00', '14:00'])
  assert.equal(settings({ week }).week[0].intervals[0].start, '09:00')
  week[0] = hours(['09:00', '14:00'], ['13:00', '15:00'])
  assert.throws(() => settings({ week }), /overlap/)
  week[0] = hours(['01:00', '12:00'])
  week[6] = hours(['18:00', '02:00'])
  assert.throws(() => settings({ week }), /following day/)
})

test('opening is inclusive, closing exclusive, and split shifts close for lunch', () => {
  const week = Array.from({ length: 7 }, closed)
  week[0] = hours(['09:00', '14:00'], ['16:00', '22:00'])
  const data = settings({ week })
  for (const [time, expected] of [
    ['08:59:59', false],
    ['09:00:00', true],
    ['13:59:59', true],
    ['14:00:00', false],
    ['16:00:00', true],
    ['22:00:00', false],
  ]) {
    assert.equal(state(data, `2026-11-09T${time}Z`).open, expected, time)
  }
  assert.equal(
    iso(state(data, '2026-11-09T14:00:00Z').next),
    '2026-11-09T16:00:00.000Z'
  )
})

test('touching intervals are continuous, not a false closing', () => {
  const week = Array.from({ length: 7 }, closed)
  week[0] = hours(['09:00', '14:00'], ['14:00', '18:00'])
  assert.equal(
    iso(state(settings({ week }), '2026-11-09T10:00Z').next),
    '2026-11-09T18:00:00.000Z'
  )
})

test('overnight hours carry into a closed day and across the week boundary', () => {
  const week = Array.from({ length: 7 }, closed)
  week[6] = hours(['18:00', '02:00'])
  const data = settings({ week })
  assert.equal(state(data, '2026-11-09T01:00Z').open, true)
  assert.equal(
    iso(state(data, '2026-11-09T01:00Z').next),
    '2026-11-09T02:00:00.000Z'
  )
  assert.equal(state(data, '2026-11-09T02:00Z').open, false)
})

test('a closed special date cancels incoming overnight hours at midnight', () => {
  const week = Array.from({ length: 7 }, closed)
  week[6] = hours(['18:00', '02:00'])
  const data = settings({
    week,
    exceptions: [{ date: '2026-11-09', label: 'Holiday', ...closed() }],
  })
  assert.equal(
    iso(state(data, '2026-11-08T23:00Z').next),
    '2026-11-09T00:00:00.000Z'
  )
  assert.equal(state(data, '2026-11-09T01:00Z').open, false)
})

test('special hours replace the day, may open a regular day off, and may run overnight', () => {
  const data = settings({
    week: Array.from({ length: 7 }, closed),
    exceptions: [
      {
        date: '2026-12-25',
        label: 'Holiday service',
        ...hours(['18:00', '02:00']),
      },
    ],
  })
  assert.equal(state(data, '2026-12-26T01:30Z').open, true)
  assert.equal(
    iso(state(data, '2026-12-26T01:30Z').next),
    '2026-12-26T02:00:00.000Z'
  )
  assert.equal(
    iso(state(data, '2026-11-09T01:00Z').next),
    '2026-12-25T18:00:00.000Z'
  )
})

test('consecutive special dates override incoming special hours too', () => {
  const data = settings({
    week: Array.from({ length: 7 }, closed),
    exceptions: [
      { date: '2026-12-25', label: '', ...hours(['18:00', '02:00']) },
      { date: '2026-12-26', label: '', ...hours(['01:00', '04:00']) },
    ],
  })
  assert.equal(state(data, '2026-12-26T00:30Z').open, false)
  assert.equal(state(data, '2026-12-26T01:00Z').open, true)
})

test('duplicate dates, too many intervals, and special spill collisions are rejected', () => {
  const day = { date: '2026-11-09', label: '', ...closed() }
  assert.throws(() => settings({ exceptions: [day, day] }), /already/)
  assert.throws(
    () =>
      settings({
        exceptions: [
          {
            ...day,
            ...hours(
              ['09:00', '10:00'],
              ['11:00', '12:00'],
              ['13:00', '14:00'],
              ['15:00', '16:00']
            ),
          },
        ],
      }),
    /at most/
  )
  assert.throws(
    () => settings({ exceptions: [{ ...day, ...hours(['23:00', '10:00']) }] }),
    /overlap/
  )
})

test('continuous 24/7 has no invented weekly closing; closed weeks have no invented opening', () => {
  const open = settings({ week: Array.from({ length: 7 }, allDay) })
  assert.deepEqual(state(open, '2026-11-09T12:00Z'), {
    open: true,
    today: '2026-11-09',
    next: null,
  })
  const shut = settings({ week: Array.from({ length: 7 }, closed) })
  assert.equal(state(shut, '2026-11-09T12:00Z').next, null)
})

test('24/7 and closed weeks jump directly to far-future exceptions without a date horizon', () => {
  for (const mode of ['open', 'closed']) {
    const data = settings({
      week: Array.from({ length: 7 }, mode === 'open' ? allDay : closed),
      exceptions: [
        {
          date: '2036-01-01',
          label: '',
          ...(mode === 'open' ? closed() : hours(['10:00', '12:00'])),
        },
      ],
    })
    assert.equal(
      iso(state(data, '2026-11-09T12:00Z').next),
      mode === 'open' ? '2036-01-01T00:00:00.000Z' : '2036-01-01T10:00:00.000Z'
    )
  }
})

test('long sequences of closed exceptions still find the next weekly opening', () => {
  const exceptions = Array.from({ length: 60 }, (_, i) => ({
    date: addDays('2026-11-09', i),
    label: '',
    ...closed(),
  }))
  assert.equal(
    iso(state(settings({ exceptions }), '2026-11-09T12:00Z').next),
    '2027-01-08T09:00:00.000Z'
  )
})

test('business date and status use the configured time zone, including fractional offsets', () => {
  const data = settings({ timeZone: 'Asia/Kathmandu' })
  const value = state(data, '2026-11-08T23:30Z')
  assert.equal(value.today, '2026-11-09')
  assert.equal(value.open, false)
  assert.equal(iso(value.next), '2026-11-09T03:15:00.000Z')
})

test('spring-forward missing times move forward by the gap', () => {
  const clock = zonedClock('America/New_York')
  assert.equal(
    iso(clock.instant('2026-03-08', 150)),
    '2026-03-08T07:30:00.000Z'
  )
  const week = Array.from({ length: 7 }, closed)
  week[6] = hours(['02:30', '04:00'])
  const data = settings({ timeZone: 'America/New_York', week })
  assert.equal(state(data, '2026-03-08T07:15Z').open, false)
  assert.equal(state(data, '2026-03-08T07:30Z').open, true)
  assert.equal(
    iso(state(data, '2026-03-08T07:30Z').next),
    '2026-03-08T08:00:00.000Z'
  )
})

test('fall-back repeated hours use the first opening and last closing', () => {
  const week = Array.from({ length: 7 }, closed)
  week[6] = hours(['01:30', '01:45'])
  const data = settings({ timeZone: 'America/New_York', week })
  for (const instant of [
    '2026-11-01T05:40Z',
    '2026-11-01T06:00Z',
    '2026-11-01T06:40Z',
  ])
    assert.equal(state(data, instant).open, true)
  assert.equal(
    iso(state(data, '2026-11-01T05:40Z').next),
    '2026-11-01T06:45:00.000Z'
  )
  assert.equal(state(data, '2026-11-01T06:45Z').open, false)
})

test('half-hour DST changes and all-day intervals preserve actual civil-day boundaries', () => {
  const clock = zonedClock('Australia/Lord_Howe')
  assert.equal(
    iso(clock.instant('2026-10-04', 135)),
    '2026-10-03T15:45:00.000Z'
  )
  const data = settings({
    timeZone: 'America/New_York',
    week: Array.from({ length: 7 }, allDay),
    exceptions: [{ date: '2026-03-09', label: '', ...closed() }],
  })
  assert.equal(
    iso(state(data, '2026-03-08T05:00Z').next),
    '2026-03-09T04:00:00.000Z'
  )
})

test('date-line skipped days produce no negative intervals', () => {
  const data = settings({
    timeZone: 'Pacific/Apia',
    week: Array.from({ length: 7 }, allDay),
  })
  const schedule = createSchedule(data)
  assert.deepEqual(schedule.intervals('2011-12-30'), [])
  assert.equal(schedule.state(new Date('2011-12-30T12:00Z')).open, true)
})

test('formats 12/24-hour clocks and next-day labels without ambiguous overnight times', () => {
  assert.equal(formatTime('00:00', '12'), '12:00am')
  assert.equal(formatTime('12:00', '12'), '12:00pm')
  assert.equal(formatTime('18:30', '24'), '18:30')
  assert.deepEqual(describeDay(hours(['18:00', '02:00'])), ['18:00–02:00 +1'])
  const clock = zonedClock('UTC')
  assert.equal(
    nextChange(
      {
        open: false,
        today: '2026-11-09',
        next: Date.parse('2026-11-10T09:00Z'),
      },
      clock
    ),
    'Opens tomorrow at 09:00'
  )
  assert.equal(
    nextChange({ open: true, today: '2026-11-09', next: null }, clock),
    'Open 24 hours'
  )
})
