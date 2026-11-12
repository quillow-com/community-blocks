import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { browser } from './browser.mjs'

let page
before(async () => (page = await browser()))
after(async () => page?.close())

for (const orientation of ['horizontal', 'vertical']) {
  test(`${orientation} keyboard arrows move in opposite directions`, async () => {
    await page.load({ reduced: true, settings: { orientation } })
    const values = await page.run(`const knob = doc.getElementById('knob');
      const values = [];
      for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
        knob.dispatchEvent(new frame.KeyboardEvent('keydown', {key,bubbles:true}));
        values.push(Number(knob.getAttribute('aria-valuenow')));
      }
      return values;`)
    assert.deepEqual(
      values,
      orientation === 'vertical'
        ? [45, 50, 45, 50, 0, 100]
        : [55, 50, 45, 50, 0, 100]
    )
  })

  for (const size of ['1:1', '2:1', '2:2']) {
    test(`${orientation} quick click reaches its target in ${size}`, async () => {
      await page.load({ size, settings: { orientation } })
      const point = await page.point(80)
      await page.cdp('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        button: 'left',
        buttons: 1,
        clickCount: 1,
        ...point,
      })
      await page.cdp('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        button: 'left',
        buttons: 0,
        clickCount: 1,
        ...point,
      })
      await page.wait(
        "doc.getElementById('cmp').style.getPropertyValue('--p') === '80.000'"
      )
      assert.equal(
        await page.run(
          "return doc.getElementById('knob').getAttribute('aria-valuenow');"
        ),
        '80'
      )
    })
  }
}

test('pointer cancellation stops at the current position without seeking the drag target', async () => {
  await page.load()
  const point = await page.point(80)
  await page.cdp('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    button: 'left',
    buttons: 1,
    clickCount: 1,
    ...point,
  })
  const stopped = await page.run(`const cmp = doc.getElementById('cmp');
    cmp.dispatchEvent(new frame.PointerEvent('pointercancel', {pointerId:1,bubbles:true}));
    return cmp.style.getPropertyValue('--p');`)
  await page.cdp('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    button: 'left',
    buttons: 0,
    clickCount: 1,
    ...point,
  })
  await page.run('await new Promise(resolve => setTimeout(resolve, 300));')
  assert.equal(
    await page.run(
      "return doc.getElementById('cmp').style.getPropertyValue('--p');"
    ),
    stopped
  )
})

test('early keyboard interaction cancels the initial hint permanently', async () => {
  await page.load({ settings: { hint: true } })
  await page.run(
    `doc.getElementById('knob').dispatchEvent(new frame.KeyboardEvent('keydown', {key:'End',bubbles:true}));`
  )
  await page.run('await new Promise(resolve => setTimeout(resolve, 4000));')
  assert.equal(
    await page.run(
      "return doc.getElementById('knob').getAttribute('aria-valuenow');"
    ),
    '100'
  )
})

test('early pointer interaction cancels the initial hint permanently', async () => {
  await page.load({ settings: { hint: true } })
  const point = await page.point(80)
  await page.cdp('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    button: 'left',
    buttons: 1,
    clickCount: 1,
    ...point,
  })
  await page.cdp('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    button: 'left',
    buttons: 0,
    clickCount: 1,
    ...point,
  })
  await page.run('await new Promise(resolve => setTimeout(resolve, 4000));')
  assert.equal(
    await page.run(
      "return doc.getElementById('knob').getAttribute('aria-valuenow');"
    ),
    '80'
  )
})

test('the hint still animates without interaction and respects reduced motion', async () => {
  await page.load({ settings: { hint: true } })
  await page.wait(
    "Number(doc.getElementById('cmp').style.getPropertyValue('--p')) > 55"
  )
  await page.run('await new Promise(resolve => setTimeout(resolve, 3500));')
  assert.equal(
    await page.run(
      "return doc.getElementById('knob').getAttribute('aria-valuenow');"
    ),
    '50'
  )
  await page.load({ reduced: true, settings: { hint: true } })
  await page.run('await new Promise(resolve => setTimeout(resolve, 900));')
  assert.equal(
    await page.run(
      "return doc.getElementById('cmp').style.getPropertyValue('--p');"
    ),
    '50.000'
  )
})

test('storage failures show an unavailable state instead of sample images', async () => {
  await page.load({ storageError: true })
  const state = await page.run(`return {
    comparisonHidden:frame.getComputedStyle(doc.getElementById('cmp')).display === 'none',
    message:doc.getElementById('error').textContent,
    errorVisible:frame.getComputedStyle(doc.getElementById('error')).display !== 'none',
    before:doc.getElementById('before').getAttribute('src'),
    after:doc.getElementById('after').getAttribute('src'),
    disabled:doc.getElementById('knob').disabled
  };`)
  assert.deepEqual(state, {
    comparisonHidden: true,
    message: 'Images unavailable right now.',
    errorVisible: true,
    before: null,
    after: null,
    disabled: true,
  })
})

test('empty saved data and standalone previews still display samples', async () => {
  await page.load({ empty: true, reduced: true })
  assert.deepEqual(
    await page.run(`return {
    before:doc.getElementById('before').getAttribute('src'),
    after:doc.getElementById('after').getAttribute('src'),
    errorHidden:frame.getComputedStyle(doc.getElementById('error')).display === 'none',
    disabled:doc.getElementById('knob').disabled
  };`),
    {
      before: './default-before.jpg',
      after: './default-after.jpg',
      errorHidden: true,
      disabled: false,
    }
  )
  await page.standalone()
  assert.equal(
    await page.evaluate(
      "document.getElementById('before').getAttribute('src')"
    ),
    './default-before.jpg'
  )
  assert.equal(
    await page.evaluate("document.getElementById('error').hidden"),
    true
  )
})

async function prepareUpload() {
  await page.run(`frame.pendingBitmaps = [];
    const original = frame.createImageBitmap.bind(frame);
    frame.createImageBitmap = (...args) => new Promise(resolve => {
      frame.pendingBitmaps.push(async () => resolve(await original(...args)));
    });
    frame.selectImage = index => {
      const canvas = doc.createElement('canvas');
      canvas.width = canvas.height = 4;
      canvas.getContext('2d').fillRect(0, 0, 4, 4);
      const bytes = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), ch => ch.charCodeAt(0));
      const transfer = new frame.DataTransfer();
      transfer.items.add(new frame.File([bytes], 'image.png', {type:'image/png'}));
      const input = doc.querySelectorAll('input[type="file"]')[index];
      input.files = transfer.files;
      input.dispatchEvent(new frame.Event('change', {bubbles:true}));
    };`)
}

const saveButton =
  "[...doc.querySelectorAll('button')].find(button => button.textContent === 'Save')"

test('image processing blocks Save and Swap until the new image can be saved', async () => {
  await page.load({ editor: true })
  await prepareUpload()
  await page.run('frame.selectImage(0);')
  const pending = await page.run(`const save = ${saveButton};
    const swap = [...doc.querySelectorAll('button')].find(button => button.textContent === 'Swap images');
    save.dispatchEvent(new frame.Event('click'));
    return {saveDisabled:save.disabled,swapDisabled:swap.disabled,status:doc.querySelector('.status').textContent,writes:window.writes.length};`)
  assert.equal(pending.saveDisabled, true)
  assert.equal(pending.swapDisabled, true)
  assert.equal(pending.writes, 0)
  assert.ok(!pending.status.startsWith('Saved.'))
  await page.run('await frame.pendingBitmaps.shift()();')
  await page.wait(`!(${saveButton}).disabled`)
  await page.run(`(${saveButton}).click();`)
  await page.wait(
    "doc.querySelector('.status').textContent.startsWith('Saved.')"
  )
  assert.match(
    await page.evaluate("window.values['image-before']"),
    /^data:image\/(webp|jpeg);base64,/
  )
})

test('overlapping before/after uploads keep saving blocked until both complete', async () => {
  await page.load({ editor: true })
  await prepareUpload()
  await page.run('frame.selectImage(0); frame.selectImage(1);')
  await page.run('await frame.pendingBitmaps.shift()();')
  await page.wait(
    "doc.querySelectorAll('.image-field .thumb img').length === 1"
  )
  assert.equal(await page.run(`return (${saveButton}).disabled;`), true)
  await page.run('await frame.pendingBitmaps.shift()();')
  await page.wait(`!(${saveButton}).disabled`)
  assert.equal(
    await page.run(
      "return doc.querySelectorAll('.image-field .thumb img').length;"
    ),
    2
  )
  await page.run(`(${saveButton}).click();`)
  await page.wait(
    "doc.querySelector('.status').textContent.startsWith('Saved.')"
  )
  assert.match(
    await page.evaluate("window.values['image-before']"),
    /^data:image\//
  )
  assert.match(
    await page.evaluate("window.values['image-after']"),
    /^data:image\//
  )
})

test('failed processing restores the controls and does not replace the old image', async () => {
  await page.load({ editor: true })
  await page.run(`const transfer = new frame.DataTransfer();
    transfer.items.add(new frame.File(['invalid image'], 'invalid.png', {type:'image/png'}));
    const input = doc.querySelector('input[type="file"]');
    input.files = transfer.files;
    input.dispatchEvent(new frame.Event('change', {bubbles:true}));`)
  await page.wait(
    "doc.querySelector('.image-field [role=\"status\"]').textContent.includes('could not be read')"
  )
  assert.equal(await page.run(`return (${saveButton}).disabled;`), false)
  assert.equal(
    await page.run(
      'return doc.querySelector(\'input[type="file"]\').disabled;'
    ),
    false
  )
  assert.equal(await page.evaluate("window.values['image-before']"), '')
  assert.equal(
    await page.run("return doc.querySelector('.image-field .thumb img');"),
    null
  )
})

test('saving freezes the fields until storage acknowledges the snapshot', async () => {
  await page.load({ editor: true })
  await page.run(`window.holdWrites = true;
    const input = doc.querySelector('input[type="text"]');
    input.value = 'Original';
    input.dispatchEvent(new frame.Event('input', {bubbles:true}));
    (${saveButton}).click();`)
  assert.equal(
    await page.run("return doc.querySelector('fieldset').disabled;"),
    true
  )
  assert.equal(
    await page.run(
      "return doc.querySelector('input[type=\"file\"]').matches(':disabled');"
    ),
    true
  )
  await page.evaluate('window.releaseWrites()')
  await page.wait(
    "doc.querySelector('.status').textContent.startsWith('Saved.')"
  )
  assert.equal(
    await page.run("return doc.querySelector('fieldset').disabled;"),
    false
  )
  assert.equal(
    JSON.parse(await page.evaluate('window.values.settings')).beforeLabel,
    'Original'
  )
})

test('read-only editors never enable Save', async () => {
  await page.load({ editor: true, readOnly: true })
  assert.equal(await page.run(`return (${saveButton}).disabled;`), true)
  assert.equal(
    await page.run("return doc.querySelector('fieldset').disabled;"),
    true
  )
})
