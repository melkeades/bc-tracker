const assert = require('node:assert/strict')
const { test } = require('node:test')
const { Basecamp } = require('../src/main/basecamp')

const ME = 1
const OTHER = 2
const CONFIG = { client_id: 'id', client_secret: 'secret', refresh_token: 'refresh', account_id: 9 }

const raw = (id, person, creator = person) => ({
  id,
  person: { id: person },
  creator: { id: creator },
  parent: { id: 100, title: 'Task', app_url: 'https://app.basecamp.com/t' },
  bucket: { name: 'NEFI' },
  date: '2026-11-05',
  hours: '1.0',
  created_at: `2026-11-05T0${id}:00:00.000Z`,
})

function client(report) {
  const json = (body) => new Response(JSON.stringify(body), { status: 200 })
  return new Basecamp(CONFIG, async (url) => {
    if (url.includes('/authorization/token')) return json({ access_token: 'token', expires_in: 3600 })
    if (url.includes('/my/profile.json')) return json({ id: ME })
    return json(report)
  })
}

test('entries leaves out teammates, because the report returns everyone', async () => {
  const entries = await client([raw(1, ME), raw(2, OTHER)]).entries()
  assert.deepEqual(entries.map((e) => e.id), [1])
})

test('entries keeps time someone else logged for me, and drops time I logged for them', async () => {
  const entries = await client([raw(1, ME, OTHER), raw(2, OTHER, ME)]).entries()
  assert.deepEqual(entries.map((e) => e.id), [1])
})

test('entries come back newest first', async () => {
  const entries = await client([raw(1, ME), raw(3, ME), raw(2, ME)]).entries()
  assert.deepEqual(entries.map((e) => e.id), [3, 2, 1])
})
