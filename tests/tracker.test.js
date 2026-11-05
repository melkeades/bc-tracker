const assert = require('node:assert/strict')
const { test } = require('node:test')
const { HttpError } = require('../src/main/basecamp')
const { Tracker } = require('../src/main/tracker')

const MIN = 60000
const taskA = { recordingId: 1, title: 'A', url: 'https://app.basecamp.com/a' }
const taskB = { recordingId: 2, title: 'B', url: 'https://app.basecamp.com/b' }

function setup({ createEntry = async () => {}, saved = {} } = {}) {
  const logged = []
  const clock = { now: new Date(2026, 10, 5, 12).getTime() }
  const disk = { data: saved }
  const tracker = new Tracker({
    api: {
      createEntry: async (entry) => {
        await createEntry(entry)
        logged.push(entry)
      },
    },
    store: { load: () => disk.data, save: (data) => (disk.data = JSON.parse(JSON.stringify(data))) },
    now: () => clock.now,
  })
  return { tracker, logged, clock, disk }
}

test('stop logs elapsed time rounded to the nearest minute', async () => {
  const { tracker, logged, clock } = setup()
  tracker.start(taskA)
  clock.now += 7.6 * MIN
  await tracker.stop()
  assert.deepEqual(logged, [{ recordingId: 1, title: 'A', date: '2026-11-05', minutes: 8 }])
  assert.equal(tracker.state.running, null)
})

test('sessions under one minute are discarded', async () => {
  const { tracker, logged, clock } = setup()
  tracker.start(taskA)
  clock.now += 59 * 1000
  await tracker.stop()
  assert.equal(logged.length, 0)
})

test('starting a different task logs the previous one', async () => {
  const { tracker, logged, clock } = setup()
  tracker.start(taskA)
  clock.now += 5 * MIN
  tracker.start(taskB)
  await tracker.flush()
  assert.equal(tracker.state.running.recordingId, 2)
  assert.equal(logged[0].recordingId, 1)
  assert.equal(logged[0].minutes, 5)
})

test('starting the running task again changes nothing', () => {
  const { tracker, clock } = setup()
  tracker.start(taskA)
  const { startedAt } = tracker.state.running
  clock.now += 5 * MIN
  tracker.start(taskA)
  assert.equal(tracker.state.running.startedAt, startedAt)
})

test('toggle resumes the last task, and fails with no history', async () => {
  const { tracker } = setup()
  await assert.rejects(tracker.toggle(), /No previous task/)
  tracker.start(taskA)
  await tracker.toggle()
  assert.equal(tracker.state.running, null)
  await tracker.toggle()
  assert.equal(tracker.state.running.recordingId, 1)
})

test('toggle falls back to the given task on a fresh install', async () => {
  const { tracker } = setup()
  await tracker.toggle(taskB)
  assert.equal(tracker.state.running.recordingId, 2)
})

test('network failures keep the session queued and retry it', async () => {
  let online = false
  const { tracker, logged, clock, disk } = setup({
    createEntry: async () => {
      if (!online) throw new TypeError('fetch failed')
    },
  })
  tracker.start(taskA)
  clock.now += 5 * MIN
  await tracker.stop()
  assert.equal(tracker.state.pending, 1)
  assert.match(tracker.state.error, /will retry/)
  assert.equal(disk.data.pending.length, 1)

  online = true
  await tracker.flush()
  assert.equal(tracker.state.pending, 0)
  assert.equal(tracker.state.error, null)
  assert.equal(logged.length, 1)
})

test('server errors retry, but a refused entry is dropped with an error', async () => {
  let status = 503
  const { tracker, clock } = setup({
    createEntry: async () => {
      throw new HttpError(status)
    },
  })
  tracker.start(taskA)
  clock.now += 5 * MIN
  await tracker.stop()
  assert.equal(tracker.state.pending, 1)

  status = 404
  await tracker.flush()
  assert.equal(tracker.state.pending, 0)
  assert.match(tracker.state.error, /Dropped 5 min on "A"/)
})

test('a running timer and queued sessions survive a restart', async () => {
  const startedAt = new Date(2026, 10, 5, 11).getTime()
  const pending = [{ recordingId: 2, title: 'B', date: '2026-11-04', minutes: 30 }]
  const { tracker, logged, clock } = setup({ saved: { running: { ...taskA, startedAt }, pending } })
  await tracker.flush()
  assert.equal(logged[0].minutes, 30)
  await tracker.stop()
  assert.equal(logged[1].minutes, Math.round((clock.now - startedAt) / MIN))
})

test('stop saves the session before it touches the network', () => {
  const { tracker, clock, disk } = setup({ createEntry: () => new Promise(() => {}) })
  tracker.start(taskA)
  clock.now += 5 * MIN
  tracker.stop()
  assert.equal(disk.data.running, null)
  assert.equal(disk.data.pending.length, 1)
})
