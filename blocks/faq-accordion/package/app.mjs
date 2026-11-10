import {
  blockSize,
  el,
  icon,
  isEditorEnv,
  loadStored,
  onSizeChange,
  parseJSON,
  startTheme,
  unavailableText,
} from './kit.mjs'
import { KEY, normalize } from './settings.mjs'

startTheme()

const root = document.getElementById('faq')
let data = normalize(null)
let unavailable = false
let errorCode = ''
let active = 0 // current question in the small and medium compositions
let showAnswer = false // small composition: question face or answer face
let openIndex = -1 // large composition: expanded row

const n = () => data.items.length

function chevronButton(dir, label, onClick, key) {
  return el(
    'button',
    {
      type: 'button',
      class: 'qb-icon-btn',
      'aria-label': label,
      'data-k': key,
      onClick,
    },
    icon(dir)
  )
}

function go(delta, key) {
  active = (active + delta + n()) % n()
  showAnswer = false
  render(key, true)
}

function renderSmall(animate) {
  const item = data.items[active]
  const swap = animate ? ' view-swap' : ''
  return el(
    'section',
    { class: 'small', 'aria-label': 'Frequently asked questions' },
    el(
      'div',
      { class: `small__body${swap}`, 'aria-live': 'polite' },
      el('span', { class: 'count' }, `${active + 1} / ${n()}`),
      el(
        'div',
        { class: 'scroll' },
        showAnswer
          ? el('p', { class: 'a' }, item.a || 'No answer yet.')
          : el('h2', { class: 'q' }, item.q)
      )
    ),
    el(
      'div',
      { class: 'small__nav' },
      chevronButton('left', 'Previous question', () => go(-1, 'prev'), 'prev'),
      el(
        'button',
        {
          type: 'button',
          class: 'flip',
          'data-k': 'flip',
          'aria-pressed': String(showAnswer),
          onClick: () => {
            showAnswer = !showAnswer
            render('flip', true)
          },
        },
        showAnswer ? 'Question' : 'Answer'
      ),
      chevronButton('right', 'Next question', () => go(1, 'next'), 'next')
    )
  )
}

function renderMedium(animate) {
  const item = data.items[active]
  const swap = animate ? ' view-swap' : ''
  return el(
    'section',
    { class: 'medium', 'aria-label': 'Frequently asked questions' },
    el(
      'div',
      { class: 'medium__left' },
      el(
        'div',
        { class: `scroll q-wrap${swap}`, style: 'flex:1' },
        el('h2', { class: 'q' }, item.q)
      ),
      el(
        'div',
        { class: 'pager' },
        chevronButton(
          'left',
          'Previous question',
          () => go(-1, 'prev'),
          'prev'
        ),
        el('span', { class: 'count' }, `${active + 1} / ${n()}`),
        chevronButton('right', 'Next question', () => go(1, 'next'), 'next')
      )
    ),
    el(
      'div',
      { class: `medium__right scroll${swap}`, 'aria-live': 'polite' },
      el('p', { class: 'a' }, item.a || 'No answer yet.')
    )
  )
}

function renderLarge() {
  const buttons = []
  const items = data.items.map((item, i) => {
    const open = i === openIndex
    const qid = `q${i}`
    const aid = `a${i}`
    const button = el(
      'button',
      {
        type: 'button',
        class: 'acc-q',
        id: qid,
        'aria-expanded': String(open),
        'aria-controls': aid,
      },
      el('span', {}, item.q),
      icon('down')
    )
    const panel = el(
      'div',
      {
        class: `acc-panel${open ? ' is-open' : ''}`,
        id: aid,
        role: 'region',
        'aria-labelledby': qid,
      },
      el(
        'div',
        { class: 'acc-inner' },
        el('p', { class: 'a' }, item.a || 'No answer yet.')
      )
    )
    buttons.push({ button, panel })
    button.addEventListener('click', () => {
      const willOpen = button.getAttribute('aria-expanded') !== 'true'
      buttons.forEach((b, j) => {
        const on = willOpen && j === i
        b.button.setAttribute('aria-expanded', String(on))
        b.panel.classList.toggle('is-open', on)
      })
      openIndex = willOpen ? i : -1
      setTimeout(watchClipped, 280) // after the height transition settles
    })
    return el('li', { class: 'acc-item' }, el('h2', {}, button), panel)
  })
  const list = el('ul', { class: 'acc scroll' }, items)
  list.addEventListener('keydown', (event) => {
    const current = buttons.findIndex(
      (b) => b.button === document.activeElement
    )
    if (current < 0) return
    let next
    if (event.key === 'ArrowDown') next = (current + 1) % buttons.length
    else if (event.key === 'ArrowUp')
      next = (current - 1 + buttons.length) % buttons.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = buttons.length - 1
    else return
    event.preventDefault()
    buttons[next].button.focus()
  })
  return el(
    'section',
    { class: 'large', 'aria-label': 'Frequently asked questions' },
    data.title ? el('h1', {}, data.title) : null,
    list
  )
}

function renderEmpty() {
  const message = unavailable
    ? unavailableText('FAQ', errorCode)
    : isEditorEnv()
      ? 'No questions yet. Add some in the block settings.'
      : 'No questions yet.'
  return el('p', { class: 'faq-empty', role: 'status' }, message)
}

function render(focusKey, animate = false) {
  const size = blockSize()
  root.dataset.size = size
  const scrollTop = root.querySelector('.acc')?.scrollTop ?? 0
  if (n() === 0 || unavailable) root.replaceChildren(renderEmpty())
  else if (size === '1:1') root.replaceChildren(renderSmall(animate))
  else if (size === '2:1') root.replaceChildren(renderMedium(animate))
  else {
    root.replaceChildren(renderLarge())
    root.querySelector('.acc').scrollTop = scrollTop
  }
  if (focusKey) root.querySelector(`[data-k="${focusKey}"]`)?.focus()
  watchClipped()
}

// Scrollbars are hidden, so mark regions with more to read (a fade at the bottom edge).
function watchClipped() {
  const mark = (node) =>
    node.classList.toggle(
      'is-clipped',
      node.scrollHeight > node.clientHeight + 1 &&
        node.scrollTop + node.clientHeight < node.scrollHeight - 1
    )
  requestAnimationFrame(() => {
    for (const node of root.querySelectorAll('.scroll')) {
      mark(node)
      node.addEventListener('scroll', () => mark(node), { passive: true })
    }
  })
}

async function start() {
  const { status, values, code } = await loadStored([KEY])
  unavailable = status === 'unavailable'
  errorCode = code ?? ''
  const parsed = parseJSON(values[KEY])
  if (values[KEY] !== null && values[KEY] !== undefined && parsed === undefined)
    unavailable = true
  data = normalize(parsed)
  openIndex = data.firstOpen && n() > 0 ? 0 : -1
  render()
  document.body.setAttribute('data-ready', '')
}

onSizeChange(() => {
  if (openIndex >= 0) active = openIndex
  else active = Math.min(active, Math.max(0, n() - 1))
  render()
})
void start()
