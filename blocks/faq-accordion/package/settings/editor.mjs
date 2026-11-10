import {
  checkSize,
  h,
  listEditor,
  section,
  startEditor,
  switchField,
  textField,
  ValidationError,
} from './editor-kit.mjs'
import { parseJSON } from '../kit.mjs'
import { DEFAULTS, KEY, LIMITS, MAX_ITEMS, normalize } from '../settings.mjs'

startEditor({
  root: document.getElementById('app'),
  title: 'FAQ',
  description:
    'Add the questions your visitors ask most. Answers can have line breaks.',
  keys: [KEY],
  build(values) {
    const s = normalize(
      values[KEY] === null ? null : (parseJSON(values[KEY]) ?? undefined)
    )
    if (values[KEY] !== null && parseJSON(values[KEY]) === undefined)
      throw new Error('unsupported')
    if (values[KEY] === null) s.items = DEFAULTS.items.map((i) => ({ ...i }))

    const title = textField({
      label: 'Title',
      hint: 'Shown above the questions in the large block. Leave blank for none.',
      value: s.title,
      maxlength: LIMITS.title,
      onInput: (v) => (s.title = v),
    })
    const firstOpen = switchField({
      label: 'Open the first question',
      hint: 'In the large block, the first answer starts expanded.',
      checked: s.firstOpen,
      onChange: (v) => (s.firstOpen = v),
    })

    const list = listEditor({
      items: s.items,
      itemLabel: 'Question',
      addLabel: 'Add question',
      max: MAX_ITEMS,
      make: () => ({ q: '', a: '' }),
      summary: (item) => item.q.slice(0, 40),
      renderItem(item) {
        const q = textField({
          label: 'Question',
          value: item.q,
          maxlength: LIMITS.q,
          onInput: (v) => (item.q = v),
        })
        const a = textField({
          label: 'Answer',
          value: item.a,
          maxlength: LIMITS.a,
          multiline: true,
          rows: 4,
          onInput: (v) => (item.a = v),
        })
        return h('div', { class: 'item-fields' }, q.el, a.el)
      },
    })

    return {
      el: h(
        'div',
        {},
        section('General', null, title.el, firstOpen.el),
        section('Questions', null, list.el)
      ),
      serialize() {
        const out = normalize({
          ...s,
          items: s.items.map((i) => ({ q: i.q, a: i.a })),
        })
        const blank = s.items.findIndex((i) => !i.q.trim())
        if (blank !== -1)
          throw new ValidationError(
            `Question ${blank + 1} is empty. Add a question or remove it.`
          )
        const value = JSON.stringify(out)
        checkSize('The FAQ', value)
        return { [KEY]: value }
      },
    }
  },
})
