const assert = require('node:assert/strict')
const http = require('node:http')
const { after, before, test } = require('node:test')
const { createBridge } = require('../src/main/bridge')

// Not the real port, so these tests can run while the app is open.
const PORT = 47899
const TASK = { recordingId: 1, title: 'A', url: 'https://app.basecamp.com/1' }

const calls = []
const tracker = {
  state: { running: null, last: null, pending: 0, error: 'private' },
  start: (task) => (calls.push(task), { running: task, pending: 0 }),
  stop: async () => ({ running: null, pending: 0 }),
}
const server = createBridge(tracker, PORT)

before(() => new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve)))
after(() => new Promise((resolve) => server.close(resolve)))

// Raw http, because fetch won't let a test set Origin or Host.
function request(method, path, { origin, host = `127.0.0.1:${PORT}`, marker = '1', body } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { Host: host, ...(origin && { Origin: origin }), ...(marker && { 'X-BC-Tracker': marker }) }
    const req = http.request({ host: '127.0.0.1', port: PORT, method, path, headers }, (res) => {
      let text = ''
      res.on('data', (chunk) => (text += chunk))
      res.on('end', () => resolve({ status: res.statusCode, text }))
    })
    req.on('error', reject)
    req.end(body && JSON.stringify(body))
  })
}

test('the extension can read state, limited to what it needs', async () => {
  const res = await request('GET', '/state')
  assert.equal(res.status, 200)
  assert.deepEqual(JSON.parse(res.text), { running: null, pending: 0 })
})

test('web pages and other hosts are refused', async () => {
  assert.equal((await request('POST', '/stop', { origin: 'https://evil.example' })).status, 403)
  assert.equal((await request('POST', '/stop', { marker: null })).status, 403)
  assert.equal((await request('OPTIONS', '/stop', { marker: null, origin: 'https://evil.example' })).status, 403)
  assert.equal((await request('GET', '/state', { host: 'evil.example' })).status, 403)
})

test('an extension Origin is accepted', async () => {
  assert.equal((await request('GET', '/state', { origin: 'chrome-extension://abc' })).status, 200)
})

test('a valid start reaches the tracker', async () => {
  const res = await request('POST', '/start', { body: TASK })
  assert.equal(res.status, 200)
  assert.deepEqual(calls.at(-1), TASK)
})

test('invalid tasks are rejected', async () => {
  const before = calls.length
  for (const body of [{ ...TASK, recordingId: '1' }, { ...TASK, title: '' }, { ...TASK, url: 'https://evil.example/' }]) {
    assert.equal((await request('POST', '/start', { body })).status, 400)
  }
  assert.equal(calls.length, before)
})

test('unknown routes return 404', async () => {
  assert.equal((await request('GET', '/nope')).status, 404)
})
