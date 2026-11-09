import {
  Quillow,
  connect,
  WidgetSDKError as BlockSDKError,
} from '../runtime.js'

if (window.parent !== window) Quillow.start()

const $ = (id) => document.getElementById(id)
let block = null
let entry = null
let writable = false
let busy = false
let disposed = false
const message = (text) => {
  $('status').textContent = text
}

function toggle(on) {
  writable = on
  $('fields').disabled = false
  $('base').disabled = !on
  $('quote').disabled = !on
  $('save').disabled = !on || !$('base').value
  $('reload').disabled = !block || busy
}

async function read() {
  if (!block || busy || disposed) return
  busy = true
  toggle(false)
  message('Loading saved pair…')
  try {
    entry = await block.storage.get('crypto.settings')
    if (disposed) return
    let value = null
    try {
      value = JSON.parse(entry?.value)
    } catch {
      /* No saved settings or invalid JSON. */
    }
    $('base').value = ''
    $('quote').value = 'USD'
    if (
      value &&
      typeof value.base === 'string' &&
      typeof value.quote === 'string'
    ) {
      if ([...$('base').options].some((option) => option.value === value.base))
        $('base').value = value.base
      if (
        [...$('quote').options].some((option) => option.value === value.quote)
      )
        $('quote').value = value.quote
    }
    busy = false
    toggle(
      block.mode === 'editor' && block.capabilities.includes('storage.set')
    )
    message(writable ? 'Ready to edit.' : 'Read-only settings.')
  } catch {
    if (disposed) return
    busy = false
    message('Could not load saved pair. Nothing changed.')
    toggle(false)
  } finally {
    busy = false
  }
}

$('base').addEventListener('change', () => {
  $('save').disabled = !writable || !$('base').value
})

$('save').addEventListener('click', async () => {
  if (!block || !writable || busy || disposed || !$('base').value) return
  busy = true
  const value = { base: $('base').value, quote: $('quote').value }
  toggle(false)
  message('Saving…')
  try {
    entry = await block.storage.set('crypto.settings', JSON.stringify(value), {
      expectedRevision: entry?.revision,
    })
    if (disposed) return
    busy = false
    toggle(
      block.mode === 'editor' && block.capabilities.includes('storage.set')
    )
    message('Saved. Close Config to update the block.')
  } catch (error) {
    if (disposed) return
    const code = error instanceof BlockSDKError ? error.code : 'unknown'
    const reason =
      {
        widget_storage_conflict: 'Settings changed in another session.',
        widget_storage_quota_exceeded: 'Storage limit reached.',
        PERMISSION_DENIED: 'Saving is not permitted.',
      }[code] || 'Could not save settings.'
    message(
      error instanceof BlockSDKError && error.mutationMayHaveSucceeded
        ? 'Save status uncertain. Reload and compare before trying again.'
        : `Save failed: ${reason} Reload and compare before trying again.`
    )
    busy = false
    toggle(false)
  } finally {
    busy = false
  }
})

$('reload').addEventListener('click', () => void read())

async function init() {
  try {
    block = await connect()
    if (disposed) {
      block.destroy()
      return
    }
    if (!block.capabilities.includes('storage.get')) {
      message('Storage read capability not available.')
      return
    }
    await read()
  } catch {
    if (!disposed)
      message('Could not connect to Quillow Storage. Nothing was saved.')
  }
}

window.addEventListener('pagehide', () => {
  disposed = true
  block?.destroy()
  Quillow.destroy()
})

void init()
