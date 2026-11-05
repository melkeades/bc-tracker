import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatElapsed, formatHours, formatTime, groupByDay, isLoggedLive } from '../src/renderer/format.js'

const entry = (id, recordingId, date, hours, title = 'Task', project = 'NEFI') => ({
  id,
  recordingId,
  date,
  hours,
  title,
  project,
  createdAt: `${date}T12:00:00Z`,
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

test('days follow the selected zone, matching the time shown on the row', () => {
  const entries = [{ ...entry(1, 10, '2026-11-05', 1), createdAt: '2026-11-04T23:12:00Z' }]
  assert.equal(groupByDay(entries, { timeZone: 'UTC' })[0].date, '2026-11-04')
  assert.equal(groupByDay(entries, { timeZone: 'Europe/Moscow' })[0].date, '2026-11-05')
  assert.equal(groupByDay(entries, { timeZone: 'America/Los_Angeles' })[0].date, '2026-11-04')
})

test('totals move with the entries when the zone changes the day', () => {
  const entries = [
    { ...entry(1, 10, '2026-11-05', 1), createdAt: '2026-11-04T23:12:00Z' },
    { ...entry(2, 20, '2026-11-05', 2), createdAt: '2026-11-05T01:00:00Z' },
  ]
  const days = groupByDay(entries, { timeZone: 'UTC' })
  assert.deepEqual(days.map((d) => [d.date, d.total]), [
    ['2026-11-05', 2],
    ['2026-11-04', 1],
  ])
})

test('bulk-imported entries keep their Basecamp date and aren\'t treated as live', () => {
  const imported = { ...entry(1, 10, '2026-10-27', 1.5), createdAt: '2026-10-29T04:52:00Z' }
  assert.equal(groupByDay([imported], { timeZone: 'UTC' })[0].date, '2026-10-27')
  assert.equal(isLoggedLive(imported, 'UTC'), false)
})

test('an entry created the next day still counts as live', () => {
  const nextDay = { ...entry(1, 10, '2026-11-04', 1), createdAt: '2026-11-05T02:00:00Z' }
  assert.equal(isLoggedLive(nextDay, 'UTC'), true)
})
