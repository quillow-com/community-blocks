import {
  h,
  numberField,
  section,
  segmented,
  selectField,
  startEditor,
  switchField,
  textField,
  ValidationError,
} from './editor-kit.mjs'
import { parseJSON } from '../kit.mjs'
import { KEY, MAX_COUNT, PLATFORMS, normalize } from '../settings.mjs'

startEditor({
  root: document.getElementById('app'),
  title: 'Social counter',
  description: 'Choose a platform and set the number your block shows.',
  keys: [KEY],
  build(values) {
    let saved = normalize(parseJSON(values[KEY]))
    const s = { ...saved }

    const platform = selectField({
      label: 'Platform',
      value: s.platform,
      options: Object.entries(PLATFORMS).map(([id, p]) => [id, p.name]),
      onChange: (v) => {
        s.platform = v
        label.input.placeholder = PLATFORMS[v].noun
      },
    })
    const label = textField({
      label: 'Label',
      hint: 'Optional. Leave blank to use the platform’s usual word.',
      value: s.label,
      maxlength: 40,
      placeholder: PLATFORMS[s.platform].noun,
      onInput: (v) => (s.label = v),
    })
    const url = textField({
      label: 'Profile link',
      hint: 'Optional. Makes the whole block a link. Must start with https://',
      value: s.url,
      type: 'url',
      placeholder: 'https://youtube.com/@yourchannel',
      onInput: (v) => (s.url = v),
    })
    const count = numberField({
      label: 'Current count',
      hint: 'Update this whenever you want the number to change.',
      value: s.count,
      min: 0,
      max: MAX_COUNT,
      step: 1,
      onInput: (v) => (s.count = v),
    })
    const format = segmented({
      label: 'Number style',
      value: s.format,
      options: [
        ['full', 'Full (1,300,000)'],
        ['compact', 'Compact (1.3M)'],
      ],
      onChange: (v) => (s.format = v),
    })
    const brand = switchField({
      label: 'Use the platform’s colour',
      hint: 'Off uses your page’s accent colour for the label instead.',
      checked: s.brand,
      onChange: (v) => (s.brand = v),
    })
    const growMin = numberField({
      label: 'Gain per day (min)',
      value: s.dailyMin,
      min: 0,
      max: 1000000,
      onInput: (v) => (s.dailyMin = v),
    })
    const growMax = numberField({
      label: 'Gain per day (max)',
      value: s.dailyMax,
      min: 0,
      max: 1000000,
      onInput: (v) => (s.dailyMax = v),
    })
    const growBox = h('div', { class: 'grid' }, growMin.el, growMax.el)
    const grow = switchField({
      label: 'Simulate daily growth',
      hint: 'The number ticks up through the day from the count you save. It is a projection, not a live feed, so update the count regularly to keep it accurate.',
      checked: s.grow,
      onChange: (v) => {
        s.grow = v
        growBox.hidden = !v
      },
    })
    growBox.hidden = !s.grow

    return {
      el: h(
        'div',
        {},
        section('Account', null, platform.el, label.el, url.el),
        section('Number', null, count.el, format.el),
        section('Appearance', null, brand.el),
        section('Growth', null, grow.el, growBox)
      ),
      serialize() {
        if (!Number.isFinite(s.count) || s.count === null || s.count < 0)
          throw new ValidationError('Enter a count of 0 or more.')
        if (s.url.trim() && !/^https:\/\//i.test(s.url.trim()))
          throw new ValidationError('The profile link must start with https://')
        const out = normalize({
          ...s,
          url: s.url.trim(),
          label: s.label.trim(),
          count: Math.round(s.count),
        })
        const changedNumber =
          out.count !== saved.count ||
          out.grow !== saved.grow ||
          out.dailyMin !== saved.dailyMin ||
          out.dailyMax !== saved.dailyMax
        out.asOf = changedNumber || !saved.asOf ? Date.now() : saved.asOf
        return { [KEY]: JSON.stringify(out) }
      },
      onSaved(values) {
        saved = normalize(parseJSON(values[KEY]))
      },
    }
  },
})
