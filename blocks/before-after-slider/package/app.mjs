import {
  Quillow,
  dataImage,
  loadStored,
  parseJSON,
  reduceMotion,
  startTheme,
  unavailableText,
} from './kit.mjs'
import { KEYS, PLACEHOLDER, normalize } from './settings.mjs'

startTheme()

const $ = (id) => document.getElementById(id)
const cmp = $('cmp')
const knob = $('knob')
const reduced = reduceMotion()

let s = normalize(null)
let vertical = false
let usingSample = true
let ready = false

// Motion state: 'seek' eases to `target`, 'drag' follows the pointer, 'glide' carries a flick.
let mode = 'seek'
let pos = 50
let target = 50
let vel = 0 // % per second while gliding
let raf = 0
let lastT = 0
let lastShown = -1
let hintTimers = []
let interacted = false
let environment = 'published'

const clamp = (v) => Math.min(100, Math.max(0, v))

function paint() {
  cmp.style.setProperty('--p', pos.toFixed(3))
  const shown = Math.round(pos)
  if (shown !== lastShown) {
    lastShown = shown
    knob.setAttribute('aria-valuenow', String(shown))
    knob.setAttribute(
      'aria-valuetext',
      `${shown}% ${s.beforeLabel || 'before'}, ${100 - shown}% ${s.afterLabel || 'after'}`
    )
  }
  $('label-before').classList.toggle('is-hidden', pos < 22)
  $('label-after').classList.toggle('is-hidden', pos > 78)
}

function frame(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016)
  lastT = t
  if (mode === 'drag') {
    pos += (target - pos) * (1 - Math.exp(-dt * 26)) // silky follow instead of a hard 1:1 snap
  } else if (mode === 'glide') {
    pos += vel * dt
    vel *= Math.exp(-dt * 3.2) // friction: a faster flick travels further
    if (pos <= 0 || pos >= 100) {
      pos = clamp(pos)
      vel = 0
    }
    if (Math.abs(vel) < 8) {
      mode = 'seek'
      target = pos < 7 ? 0 : pos > 93 ? 100 : pos // magnetic edges
    }
  } else {
    pos += (target - pos) * (1 - Math.exp(-dt * 9))
    if (Math.abs(target - pos) < 0.04) pos = target
  }
  paint()
  if (mode !== 'seek' || pos !== target) raf = requestAnimationFrame(frame)
  else raf = 0
}

function run() {
  if (!raf) {
    lastT = performance.now()
    raf = requestAnimationFrame(frame)
  }
}

function seek(value) {
  target = clamp(value)
  mode = 'seek'
  if (reduced) {
    pos = target
    paint()
    return
  }
  run()
}

/* ------------------------------------------------------------- pointer */
let pointerId = null
let grabOffset = 0
let samples = []

function pointerPct(event) {
  const rect = cmp.getBoundingClientRect()
  return vertical
    ? ((event.clientY - rect.top) / rect.height) * 100
    : ((event.clientX - rect.left) / rect.width) * 100
}

function updateNote() {
  $('note').hidden = !(usingSample && environment === 'editor')
}

function cancelHint() {
  interacted = true
  hintTimers.forEach(clearTimeout)
  hintTimers = []
}

cmp.addEventListener('pointerdown', (event) => {
  if (
    !ready ||
    pointerId !== null ||
    (event.pointerType === 'mouse' && event.button !== 0)
  )
    return
  cancelHint()
  pointerId = event.pointerId
  cmp.setPointerCapture(pointerId)
  const pct = pointerPct(event)
  grabOffset = event.target.closest?.('.cmp__knob') ? pos - pct : 0
  target = clamp(pct + grabOffset)
  mode = 'drag'
  vel = 0
  samples = [{ t: event.timeStamp, p: pct }]
  cmp.classList.add('is-drag')
  if (reduced) {
    pos = target
    paint()
  } else run()
})

cmp.addEventListener('pointermove', (event) => {
  if (event.pointerId !== pointerId) return
  const pct = pointerPct(event)
  target = clamp(pct + grabOffset)
  samples.push({ t: event.timeStamp, p: pct })
  while (samples.length > 2 && event.timeStamp - samples[0].t > 90)
    samples.shift()
  if (reduced) {
    pos = target
    paint()
  }
})

function release(event) {
  if (event.pointerId !== pointerId) return
  if (event.type === 'pointerup') target = clamp(pointerPct(event) + grabOffset)
  pointerId = null
  cmp.classList.remove('is-drag')
  // Only motion in the last ~90 ms counts: pausing before release means "place it here", not a flick.
  const recent = samples.filter((sample) => event.timeStamp - sample.t <= 90)
  const first = recent[0]
  const last = recent[recent.length - 1]
  const span = recent.length > 1 ? last.t - first.t : 0
  const v = span > 8 ? ((last.p - first.p) / span) * 1000 : 0 // % per second
  if (!reduced && event.type === 'pointerup' && Math.abs(v) > 40) {
    vel = Math.max(-1400, Math.min(1400, v))
    pos = clamp(pos)
    mode = 'glide'
    run()
  } else {
    const destination = event.type === 'pointerup' ? target : pos
    seek(
      Math.abs(destination - target) < 1 &&
        (destination < 4 || destination > 96)
        ? destination < 50
          ? 0
          : 100
        : destination
    )
  }
}
cmp.addEventListener('pointerup', release)
cmp.addEventListener('pointercancel', release)
cmp.addEventListener('lostpointercapture', (event) => {
  if (event.pointerId === pointerId) release(event)
})

/* ------------------------------------------------------------ keyboard */
knob.addEventListener('keydown', (event) => {
  if (!ready) return
  const step = event.shiftKey ? 20 : 5
  let next
  if (
    event.key === 'ArrowLeft' ||
    event.key === (vertical ? 'ArrowUp' : 'ArrowDown')
  )
    next = target - step
  else if (
    event.key === 'ArrowRight' ||
    event.key === (vertical ? 'ArrowDown' : 'ArrowUp')
  )
    next = target + step
  else if (event.key === 'PageDown') next = target - 20
  else if (event.key === 'PageUp') next = target + 20
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = 100
  else return
  event.preventDefault()
  cancelHint()
  seek(next)
})

/* ---------------------------------------------------------------- hint */
function playHint() {
  if (interacted || reduced || !s.hint || mode !== 'seek') return
  const base = s.start
  const stops = [Math.min(100, base + 18), Math.max(0, base - 18), base]
  stops.forEach((value, i) =>
    hintTimers.push(setTimeout(() => seek(value), 450 + i * 700))
  )
}

/* ---------------------------------------------------------------- data */
function setImage(img, value, fallback, alt) {
  img.src = value || fallback
  img.alt = alt
}

async function start() {
  const { status, values, code } = await loadStored([
    KEYS.settings,
    KEYS.before,
    KEYS.after,
  ])
  if (status === 'unavailable') {
    cmp.hidden = true
    $('error').textContent = unavailableText('Images', code)
    $('error').hidden = false
    document.body.setAttribute('data-ready', '')
    return
  }
  s = normalize(parseJSON(values[KEYS.settings]))
  vertical = s.orientation === 'vertical'
  cmp.dataset.orient = s.orientation
  cmp.dataset.labels = s.showLabels ? 'on' : 'off'
  const before = dataImage(values[KEYS.before])
  const after = dataImage(values[KEYS.after])
  usingSample = !before && !after
  setImage($('before'), before, PLACEHOLDER.before, s.beforeLabel || 'Before')
  setImage($('after'), after, PLACEHOLDER.after, s.afterLabel || 'After')
  $('label-before').textContent = s.beforeLabel
  $('label-after').textContent = s.afterLabel
  $('label-before').hidden = !s.beforeLabel
  $('label-after').hidden = !s.afterLabel
  cmp.setAttribute(
    'aria-label',
    `${s.beforeLabel || 'Before'} and ${s.afterLabel || 'after'} image comparison`
  )
  knob.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal')
  environment = Quillow.getContext?.()?.environment ?? environment
  updateNote()
  pos = target = s.start
  paint()
  await Promise.race([
    Promise.all([$('before').decode(), $('after').decode()]).catch(() => {}),
    new Promise((r) => setTimeout(r, 1500)),
  ])
  ready = true
  knob.disabled = false
  document.body.setAttribute('data-ready', '')
  if (!interacted && !reduced && s.hint)
    hintTimers.push(setTimeout(playHint, 300))
}

if (window.parent !== window) {
  try {
    Quillow.subscribe((ctx) => {
      environment = ctx.environment
      updateNote()
    })
  } catch {
    /* standalone */
  }
}

void start()
