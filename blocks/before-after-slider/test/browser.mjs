import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDirectory = fileURLToPath(new URL('../package/', import.meta.url))
const mime = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.jpg': 'image/jpeg',
}

function host(options) {
  const { size, editor, settings, storageError, empty, readOnly } = options
  const [width, height] =
    size === '1:1' ? [156, 156] : size === '2:1' ? [336, 156] : [336, 336]
  const values = {
    settings: empty ? null : JSON.stringify(settings),
    'image-before': empty ? null : '',
    'image-after': empty ? null : '',
  }
  const capabilities =
    editor && !readOnly ? ['storage.get', 'storage.set'] : ['storage.get']
  return `<!doctype html>
<iframe id="widget" src="/package/${editor ? 'settings/editor.html' : 'index.html'}"
  style="border:0;width:${editor ? 640 : width}px;height:${editor ? 800 : height}px"></iframe>
<script>
const envelope = {protocol:'quillow:custom-block',version:1};
window.values = ${JSON.stringify(values)};
window.writes = [];
window.holdWrites = false;
const waiters = [];
window.releaseWrites = () => { window.holdWrites = false; waiters.splice(0).forEach(resolve => resolve()); };
let revision = 1;
addEventListener('message', event => {
  const request = event.data;
  if (request?.protocol !== envelope.protocol) return;
  if (request.type === 'ready') event.source.postMessage({...envelope,type:'context',context:{
    environment:'${editor ? 'editor' : 'published'}',
    theme:{mode:'light',cornerStyle:'Normal',variables:{},fontStylesheet:null},
    layout:{size:'${size}',viewport:'desktop',width:${width},height:${height}}
  }}, event.origin);
  if (request.type !== 'connect') return;
  const channel = new MessageChannel();
  event.source.postMessage({...envelope,type:'connected',connectionId:request.connectionId,context:{
    blockId:'test',versionId:'test',mode:'${editor && !readOnly ? 'editor' : 'public'}',
    capabilities:${JSON.stringify(capabilities)}
  }}, event.origin, [channel.port2]);
  channel.port1.onmessage = async ({data:call}) => {
    const reply = {...envelope,connectionId:request.connectionId,requestId:call.requestId};
    if (call.type === 'ping') { channel.port1.postMessage({...reply,type:'pong'}); return; }
    if (call.type !== 'request') return;
    if (${storageError}) {
      channel.port1.postMessage({...reply,type:'response',ok:false,error:{code:'widget_storage_unavailable',message:'Storage unavailable'}});
      return;
    }
    if (call.method === 'storage.set') {
      if (window.holdWrites) await new Promise(resolve => waiters.push(resolve));
      window.values[call.params.key] = call.params.value;
      window.writes.push(call.params);
      revision++;
    }
    const value = window.values[call.params.key];
    channel.port1.postMessage({...reply,type:'response',ok:true,result:value === null ? null : {
      key:call.params.key,value,revision:String(revision),
      createdAt:'2026-11-12T00:00:00Z',updatedAt:'2026-11-12T00:00:00Z'
    }});
  };
  channel.port1.start();
});
</script>`
}

export async function browser() {
  let options
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost')
      if (url.pathname === '/') {
        response.setHeader('content-type', 'text/html')
        response.end(host(options))
        return
      }
      assert.ok(url.pathname.startsWith('/package/'))
      const filename = path.resolve(
        packageDirectory,
        decodeURIComponent(url.pathname.slice('/package/'.length))
      )
      assert.ok(filename.startsWith(packageDirectory))
      response.setHeader('content-type', mime[path.extname(filename)])
      response.end(await readFile(filename))
    } catch {
      response.statusCode = 404
      response.end()
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const profile = await mkdtemp(path.join(tmpdir(), 'before-after-browser-'))
  const binary =
    process.env.CHROME_BIN ??
    (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : 'chromium')
  const chrome = spawn(
    binary,
    [
      '--headless=new',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profile}`,
      '--remote-debugging-pipe',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] }
  )
  let sequence = 0
  let buffer = ''
  let sessionId
  const pending = new Map()
  const fail = (error) => {
    for (const waiter of pending.values()) waiter.reject(error)
    pending.clear()
  }
  chrome.on('error', fail)
  chrome.on('exit', () => fail(new Error('Chromium exited')))
  chrome.stdio[4].on('data', (chunk) => {
    buffer += chunk
    let end
    while ((end = buffer.indexOf('\0')) !== -1) {
      const raw = buffer.slice(0, end)
      buffer = buffer.slice(end + 1)
      if (!raw) continue
      const message = JSON.parse(raw)
      if (!message.id) continue
      const waiter = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) waiter?.reject(new Error(message.error.message))
      else waiter?.resolve(message.result)
    }
  })
  const cdp = (method, params = {}, attached = true) =>
    new Promise((resolve, reject) => {
      const id = ++sequence
      pending.set(id, { resolve, reject })
      chrome.stdio[3].write(
        JSON.stringify({
          id,
          method,
          params,
          ...(attached ? { sessionId } : {}),
        }) + '\0'
      )
    })
  async function close() {
    if (chrome.exitCode === null && chrome.pid) {
      await cdp('Browser.close', {}, false).catch(() => {})
      if (chrome.exitCode === null)
        await new Promise((resolve) => chrome.once('exit', resolve))
    }
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    await rm(profile, { recursive: true, force: true })
  }
  try {
    const { targetId } = await cdp(
      'Target.createTarget',
      { url: 'about:blank' },
      false
    )
    ;({ sessionId } = await cdp(
      'Target.attachToTarget',
      { targetId, flatten: true },
      false
    ))
    await cdp('Page.bringToFront')
  } catch (error) {
    await close()
    throw error
  }
  async function evaluate(expression) {
    const result = await cdp('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    assert.equal(
      result.exceptionDetails,
      undefined,
      JSON.stringify(result.exceptionDetails)
    )
    return result.result.value
  }
  const run = (code) =>
    evaluate(`(async () => {
      const frame = document.getElementById('widget')?.contentWindow;
      const doc = frame?.document;
      ${code}
    })()`)
  const wait = (condition) =>
    evaluate(`new Promise((resolve, reject) => {
      const deadline = performance.now() + 6000;
      function check() {
        const frame = document.getElementById('widget')?.contentWindow;
        const doc = frame?.document;
        if (${condition}) resolve();
        else if (performance.now() > deadline) reject(new Error('Condition timed out: ' + ${JSON.stringify(condition)}));
        else setTimeout(check, 10);
      }
      check();
    })`)
  return {
    close,
    cdp,
    evaluate,
    run,
    wait,
    async load(overrides = {}) {
      options = {
        size: '2:2',
        editor: false,
        storageError: false,
        empty: false,
        readOnly: false,
        ...overrides,
        settings: {
          v: 1,
          beforeLabel: 'Before',
          afterLabel: 'After',
          showLabels: true,
          orientation: 'horizontal',
          start: 50,
          hint: false,
          ...overrides.settings,
        },
      }
      await cdp('Emulation.setEmulatedMedia', {
        features: [
          {
            name: 'prefers-reduced-motion',
            value: overrides.reduced ? 'reduce' : 'no-preference',
          },
        ],
      })
      await cdp('Page.navigate', {
        url: `http://127.0.0.1:${server.address().port}/`,
      })
      await wait(
        options.editor
          ? "doc?.querySelector('.form-fields')"
          : "doc?.body.hasAttribute('data-ready')"
      )
    },
    async standalone() {
      await cdp('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      })
      await cdp('Page.navigate', {
        url: `http://127.0.0.1:${server.address().port}/package/index.html`,
      })
      await evaluate(`new Promise(resolve => {
        const check = () => document.body?.hasAttribute('data-ready') ? resolve() : setTimeout(check, 10);
        check();
      })`)
    },
    async point(percent) {
      return run(`const box = document.getElementById('widget').getBoundingClientRect();
        return ${options.settings.orientation === 'vertical'}
          ? {x:box.left + 40, y:box.top + box.height * ${percent} / 100}
          : {x:box.left + box.width * ${percent} / 100, y:box.top + 40};`)
    },
  }
}
