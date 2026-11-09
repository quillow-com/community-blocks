import { Quillow } from './runtime.js'

if (window.parent !== window) Quillow.start()

const button = document.querySelector('#action')
const message = document.querySelector('#message')

button.addEventListener('click', () => {
  const active = button.getAttribute('aria-pressed') !== 'true'
  button.setAttribute('aria-pressed', String(active))
  button.textContent = active ? 'Hello again' : 'Say hello'
  message.textContent = active
    ? 'Hello from your block!'
    : 'Make something useful.'
})

window.addEventListener('pagehide', () => Quillow.destroy(), { once: true })
