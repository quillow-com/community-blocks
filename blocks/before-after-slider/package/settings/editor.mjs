import {
  button,
  checkSize,
  h,
  imageField,
  rangeField,
  section,
  segmented,
  startEditor,
  switchField,
  textField,
  ValidationError,
} from './editor-kit.mjs'
import { dataImage, parseJSON } from '../kit.mjs'
import { IMAGE_MAX_CHARS, KEYS, normalize } from '../settings.mjs'

startEditor({
  root: document.getElementById('app'),
  title: 'Before and after slider',
  description: 'Add two images. Visitors drag the handle to compare them.',
  keys: [KEYS.settings, KEYS.before, KEYS.after],
  build(values, { setBusy }) {
    const parsed = parseJSON(values[KEYS.settings])
    if (values[KEYS.settings] !== null && parsed === undefined)
      throw new Error('unsupported')
    const s = normalize(parsed)
    const images = {
      before: dataImage(values[KEYS.before]),
      after: dataImage(values[KEYS.after]),
    }
    const processing = new Set()
    function updateProcessing(side, busy) {
      if (busy) processing.add(side)
      else processing.delete(side)
      setBusy(processing.size > 0)
      swap.disabled = processing.size > 0
    }

    const imageOptions = { maxDim: 800, maxChars: IMAGE_MAX_CHARS }
    const before = imageField({
      label: 'Before image',
      value: images.before,
      emptyText: 'Sample',
      onChange: (v) => (images.before = v),
      onProcessingChange: (busy) => updateProcessing('before', busy),
      ...imageOptions,
    })
    const after = imageField({
      label: 'After image',
      value: images.after,
      emptyText: 'Sample',
      onChange: (v) => (images.after = v),
      onProcessingChange: (busy) => updateProcessing('after', busy),
      ...imageOptions,
    })
    const swap = button('Swap images', {
      class: 'btn btn-secondary',
      onClick: () => {
        ;[images.before, images.after] = [images.after, images.before]
        before.set(images.before)
        after.set(images.after)
      },
    })

    const labels = switchField({
      label: 'Show labels',
      checked: s.showLabels,
      onChange: (v) => (s.showLabels = v),
    })
    const beforeLabel = textField({
      label: 'Before label',
      value: s.beforeLabel,
      maxlength: 24,
      onInput: (v) => (s.beforeLabel = v),
    })
    const afterLabel = textField({
      label: 'After label',
      value: s.afterLabel,
      maxlength: 24,
      onInput: (v) => (s.afterLabel = v),
    })
    const orientation = segmented({
      label: 'Direction',
      value: s.orientation,
      options: [
        ['horizontal', 'Left / right'],
        ['vertical', 'Top / bottom'],
      ],
      onChange: (v) => (s.orientation = v),
    })
    const start = rangeField({
      label: 'Starting position',
      hint: 'How much of the before image shows before anyone drags.',
      value: s.start,
      onInput: (v) => (s.start = v),
    })
    const hint = switchField({
      label: 'Nudge on load',
      hint: 'The handle sweeps once to show it can be dragged.',
      checked: s.hint,
      onChange: (v) => (s.hint = v),
    })

    return {
      el: h(
        'div',
        {},
        section(
          'Images',
          'Images are resized and compressed to fit Quillow’s storage limit (64 KB each), so very fine detail may soften. Use the same framing for both so they line up. With none added, the default images are shown.',
          h('div', { class: 'grid' }, before.el, after.el),
          h('div', { class: 'btn-row', style: 'margin-top:12px' }, swap)
        ),
        section(
          'Labels',
          null,
          labels.el,
          h('div', { class: 'grid' }, beforeLabel.el, afterLabel.el)
        ),
        section('Behaviour', null, orientation.el, start.el, hint.el)
      ),
      serialize() {
        if (processing.size)
          throw new ValidationError(
            'Wait for image processing to finish before saving.'
          )
        checkSize('Before image', images.before)
        checkSize('After image', images.after)
        return {
          [KEYS.settings]: JSON.stringify(normalize({ ...s })),
          [KEYS.before]: images.before,
          [KEYS.after]: images.after,
        }
      },
    }
  },
})
