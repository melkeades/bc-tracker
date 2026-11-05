import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatElapsed, formatHours, formatTime, groupByDay } from '../src/renderer/format.js'

const entry = (id, recordingId, date, hours, title = 'Task', project = 'NEFI') => ({
  id,
  recordingId,
  date,
  hours,
  title,
  project,
})
const ENTRIES = [
  entry(1, 10, '2026-11-05', 0.5, 'Fix menu'),
  entry(2, 10, '2026-11-05', 0.25, 'Fix menu'),
  entry(3, 20, '2026-11-05', 1, 'Bios', 'Trinity'),
  entry(4, 10, '2026-11-04', 2, 'Fix menu'),
]

test('formatElapsed pads and handles hours over a day', () => {
  assert.equal(formatElapsed(3661000), '01:01:01')
  assert.equal(formatElapsed(90000000), '25:00:00')
  assert.equal(formatElapsed(-5), '00:00:00')
})

test('formatHours turns decimal hours into hours and minutes', () => {
  assert.equal(formatHours(0.13), '0h 08m')
  assert.equal(formatHours(1.5), '1h 30m')
})

test('formatTime uses the given zone and a 24-hour clock', () => {
  assert.equal(formatTime('2026-11-05T20:00:00Z', 'America/Los_Angeles'), '12:00')
  assert.equal(formatTime('2026-11-05T20:00:00Z', 'Asia/Tokyo'), '05:00')
  assert.equal(formatTime('2026-11-05T00:30:00Z', 'UTC'), '00:30')
})

test('groups by day, newest first, with totals', () => {
  const days = groupByDay(ENTRIES)
  assert.deepEqual(days.map((d) => [d.date, d.total, d.entries.length]), [
    ['2026-11-05', 1.75, 3],
    ['2026-11-04', 2, 1],
  ])
})

test('unique/day keeps one row per task per day', () => {
  const [today, yesterday] = groupByDay(ENTRIES, { uniquePerDay: true })
  assert.deepEqual(today.entries.map((e) => e.id), [1, 3])
  assert.equal(yesterday.entries.length, 1)
})

test('search matches title and project, and leaves totals alone', () => {
  const days = groupByDay(ENTRIES, { query: 'trinity' })
  assert.equal(days.length, 1)
  assert.deepEqual(days[0].entries.map((e) => e.id), [3])
  assert.equal(days[0].total, 1.75)
})
