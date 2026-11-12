import {
  button,
  checkSize,
  h,
  section,
  selectField,
  startEditor,
  textField,
  ValidationError,
} from './editor-kit.mjs'
import {
  addDays,
  clone,
  DAYS,
  KEY,
  LIMITS,
  MAX_EXCEPTIONS,
  MAX_INTERVALS,
  minutes,
  normalize,
  validTimeZone,
} from '../settings.mjs'
import { zonedClock } from '../schedule.mjs'
import { timeZoneField } from './time-zone-field.mjs'

const modes = [
  ['hours', 'Scheduled hours'],
  ['all-day', 'Open 24 hours'],
  ['closed', 'Closed'],
]

export function buildEditor(values) {
  const saved = values[KEY]
  const parsed = saved === null ? null : JSON.parse(saved)
  if (saved !== null && parsed === null) throw new Error('Unsupported settings')
  const data = normalize(parsed)
  const weekRoot = h('div', { class: 'schedule-days' })
  const exceptionRoot = h('div', { class: 'schedule-days' })
  const chips = h('div', { class: 'day-chips', 'aria-label': 'Working days' })

  const title = textField({
    label: 'Title',
    hint: 'Shown in the large block. Leave blank to hide it.',
    value: data.title,
    maxlength: LIMITS.title,
    onInput: (v) => {
      data.title = v
    },
  })
  const note = textField({
    label: 'Note',
    hint: 'Optional. Shown below the week in the large block.',
    value: data.note,
    maxlength: LIMITS.note,
    onInput: (v) => {
      data.note = v
    },
  })
  const timeZone = timeZoneField({
    value: data.timeZone,
    onChange: (v) => {
      data.timeZone = v
    },
  })
  const useLocal = button('Use my time zone', {
    class: 'btn btn-quiet',
    onClick: () => {
      data.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      timeZone.set(data.timeZone)
    },
  })
  const format = selectField({
    label: 'Clock format',
    value: data.timeFormat,
    options: [
      ['24', '24-hour · 09:00'],
      ['12', '12-hour · 9:00am'],
    ],
    onChange: (v) => {
      data.timeFormat = v
    },
  })

  function dayFields(day, label, changed) {
    const body = h('div', { class: 'day-intervals' })
    const mode = selectField({
      label: `${label} hours`,
      value: day.mode,
      options: modes,
      onChange: (value) => {
        day.mode = value
        if (value === 'hours' && day.intervals.length === 0)
          day.intervals.push({ start: '09:00', end: '18:00' })
        draw()
        changed?.()
      },
    })
    mode.el.classList.add('day-mode')

    function draw(focusIndex) {
      body.replaceChildren()
      if (day.mode !== 'hours') return
      day.intervals.forEach((interval, i) => {
        const start = h('input', {
          type: 'time',
          value: interval.start,
          step: '60',
          'aria-label': `${label}, interval ${i + 1} start`,
        })
        const end = h('input', {
          type: 'time',
          value: interval.end,
          step: '60',
          'aria-label': `${label}, interval ${i + 1} end`,
        })
        const overnight = h('p', { class: 'field-hint overnight' })
        function update() {
          interval.start = start.value
          interval.end = end.value
          overnight.textContent =
            minutes(start.value) !== null &&
            minutes(end.value) !== null &&
            end.value < start.value
              ? 'Ends the following day'
              : ''
        }
        start.addEventListener('input', update)
        end.addEventListener('input', update)
        update()
        const remove = button('−', {
          class: 'btn-icon remove-interval',
          'aria-label': `Remove ${label} interval ${i + 1}`,
          onClick: () => {
            day.intervals.splice(i, 1)
            if (!day.intervals.length) {
              day.mode = 'closed'
              mode.input.value = 'closed'
              changed?.()
            }
            draw(Math.max(0, i - 1))
            if (day.mode === 'closed') mode.input.focus()
          },
        })
        const row = h(
          'div',
          { class: 'interval-row' },
          start,
          h('span', { 'aria-hidden': 'true' }, '–'),
          end,
          remove
        )
        body.append(row, overnight)
      })
      body.append(
        button('+ Add interval', {
          class: 'btn btn-quiet add-interval',
          disabled: day.intervals.length >= MAX_INTERVALS,
          onClick: () => {
            day.intervals.push({ start: '18:00', end: '22:00' })
            draw(day.intervals.length - 1)
          },
        })
      )
      if (focusIndex !== undefined)
        body
          .querySelectorAll('.interval-row')
          [focusIndex]?.querySelector('input')
          ?.focus()
    }
    draw()
    return h('div', { class: 'day-fields' }, mode.el, body)
  }

  function copyPicker(index) {
    const details = h('details', { class: 'copy-picker' })
    const checks = DAYS.map((name, i) => {
      const input = h('input', {
        type: 'checkbox',
        checked: i !== index && data.week[i].mode !== 'closed',
        disabled: i === index,
      })
      return { input, el: h('label', { class: 'copy-target' }, input, name) }
    })
    const result = h('p', { class: 'field-hint', role: 'status' })
    details.append(
      h('summary', {}, 'Copy times to…'),
      h(
        'div',
        { class: 'copy-options' },
        checks.map(({ el }) => el),
        button('Apply to selected days', {
          class: 'btn btn-secondary',
          onClick: () => {
            const targets = checks.flatMap(({ input }, i) =>
              input.checked && i !== index ? [i] : []
            )
            if (!targets.length) {
              result.textContent = 'Select at least one day.'
              return
            }
            const source = clone(data.week[index])
            targets.forEach((i) => {
              data.week[i] = clone(source)
            })
            renderWeek(index)
          },
        }),
        result
      )
    )
    return details
  }

  function drawChips() {
    chips.replaceChildren(
      ...DAYS.map((name, i) =>
        button(name.slice(0, 2), {
          class: 'day-chip',
          'aria-label': `${name} is ${data.week[i].mode === 'closed' ? 'closed' : 'a working day'}. Toggle working day.`,
          'aria-pressed': String(data.week[i].mode !== 'closed'),
          onClick: () => {
            const day = data.week[i]
            day.mode = day.mode === 'closed' ? 'hours' : 'closed'
            if (day.mode === 'hours' && !day.intervals.length)
              day.intervals = [{ start: '09:00', end: '18:00' }]
            renderWeek(i, true)
          },
        })
      )
    )
  }

  function renderWeek(focusDay, focusChip = false) {
    weekRoot.replaceChildren(
      ...DAYS.map((name, i) =>
        h(
          'section',
          { class: 'day-card', 'aria-label': name },
          h('h3', {}, name),
          dayFields(data.week[i], name, drawChips),
          copyPicker(i)
        )
      )
    )
    drawChips()
    if (focusDay !== undefined) {
      if (focusChip) chips.children[focusDay].focus()
      else weekRoot.children[focusDay].querySelector('summary').focus()
    }
  }

  const addDate = button('+ Add special date', {
    class: 'btn btn-secondary',
    onClick: () => {
      if (data.exceptions.length >= MAX_EXCEPTIONS) return
      let date = zonedClock(
        validTimeZone(data.timeZone) ? data.timeZone : 'UTC'
      ).parts(new Date()).date
      while (data.exceptions.some((item) => item.date === date))
        date = addDays(date, 1)
      data.exceptions.push({ date, label: '', mode: 'closed', intervals: [] })
      renderExceptions()
      exceptionRoot.lastElementChild.querySelector('input').focus()
    },
  })

  function renderExceptions() {
    exceptionRoot.replaceChildren(
      ...data.exceptions.map((day, i) => {
        const date = textField({
          label: 'Date',
          type: 'date',
          value: day.date,
          onInput: (v) => {
            day.date = v
          },
        })
        date.input.min = '1000-01-01'
        date.input.max = '9998-12-31'
        const label = textField({
          label: 'Label (optional)',
          value: day.label,
          maxlength: LIMITS.label,
          placeholder: 'Public holiday',
          onInput: (v) => {
            day.label = v
          },
        })
        return h(
          'section',
          {
            class: 'day-card special-card',
            'aria-label': `Special date ${i + 1}`,
          },
          h(
            'div',
            { class: 'special-head' },
            h('h3', {}, `Special date ${i + 1}`),
            button('Remove', {
              class: 'btn btn-quiet',
              'aria-label': `Remove special date ${i + 1}`,
              onClick: () => {
                data.exceptions.splice(i, 1)
                renderExceptions()
                addDate.focus()
              },
            })
          ),
          h('div', { class: 'grid' }, date.el, label.el),
          dayFields(day, `Special date ${i + 1}`)
        )
      })
    )
    addDate.disabled = data.exceptions.length >= MAX_EXCEPTIONS
  }
  renderWeek()
  renderExceptions()

  return {
    el: h(
      'div',
      {},
      section(
        'General',
        null,
        title.el,
        note.el,
        timeZone.el,
        useLocal,
        format.el
      ),
      section(
        'Weekly hours',
        'All times are in the business time zone. A closing time before opening means the following day. Up to three intervals per day.',
        chips,
        weekRoot
      ),
      section(
        'Special dates',
        'Override the whole date, including hours carried over from the night before. Add each date of a holiday or vacation separately.',
        exceptionRoot,
        addDate
      )
    ),
    serialize() {
      try {
        const out = normalize(data)
        const value = JSON.stringify(out)
        checkSize('Working hours', value)
        return { [KEY]: value }
      } catch (error) {
        throw new ValidationError(error.message)
      }
    },
  }
}

void startEditor({
  root: document.getElementById('app'),
  title: 'Working Hours',
  description:
    'Let visitors know when you’re open. Set weekly hours and exceptions for holidays or time off.',
  keys: [KEY],
  build: buildEditor,
})
