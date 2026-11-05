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

test('formatTime shows the computer\'s local time on a 24-hour clock', () => {
  const date = new Date(2026, 10, 5, 0, 30)
  assert.equal(formatTime(date.toISOString()), '00:30')
  assert.equal(formatTime(new Date(2026, 10, 5, 21, 8).toISOString()), '21:08')
})

test('groups by day, newest first, with totals', () => {
  const days = groupByDay(ENTRIES)
  assert.deepEqual(days.map((d) => [d.date, d.total, d.rows.length]), [
    ['2026-11-05', 1.75, 3],
    ['2026-11-04', 2, 1],
  ])
})

test('unique/day keeps one row per task per day', () => {
  const [today, yesterday] = groupByDay(ENTRIES, { uniquePerDay: true })
  assert.deepEqual(today.rows.map((r) => r.id), [1, 3])
  assert.equal(yesterday.rows.length, 1)
})

test('a unique/day row sums its entries for that day only', () => {
  const [today, yesterday] = groupByDay(ENTRIES, { uniquePerDay: true })
  const [menu, bios] = today.rows
  assert.equal(menu.hours, 0.75)
  assert.deepEqual(menu.entries.map((e) => e.id), [1, 2])
  assert.equal(bios.hours, 1)
  assert.equal(bios.entries.length, 1)
  assert.equal(yesterday.rows[0].hours, 2)
})

test('a unique/day row shows the newest entry and leaves the entries unchanged', () => {
  const newest = { ...entry(2, 10, '2026-11-05', 0.03), createdAt: '2026-11-05T18:08:00Z' }
  const older = { ...entry(1, 10, '2026-11-05', 0.25), createdAt: '2026-11-05T18:06:00Z' }
  const [{ rows: [row] }] = groupByDay([newest, older], { uniquePerDay: true, timeZone: 'UTC' })
  assert.equal(row.createdAt, newest.createdAt)
  assert.equal(row.entries[0].hours, 0.03)
  assert.equal(row.entries[1].hours, 0.25)
  assert.equal(newest.hours, 0.03)
})

test('the same task on different days stays in separate rows with separate keys', () => {
  const [today, yesterday] = groupByDay(ENTRIES, { uniquePerDay: true })
  assert.notEqual(today.rows[0].key, yesterday.rows[0].key)
})

test('without unique/day every entry is its own row', () => {
  const [today] = groupByDay(ENTRIES)
  assert.deepEqual(today.rows.map((r) => r.entries.length), [1, 1, 1])
  assert.equal(new Set(today.rows.map((r) => r.key)).size, 3)
})

test('search matches title and project, and leaves totals alone', () => {
  const days = groupByDay(ENTRIES, { query: 'trinity' })
  assert.equal(days.length, 1)
  assert.deepEqual(days[0].rows.map((r) => r.id), [3])
  assert.equal(days[0].total, 1.75)
})

test('the zone picks the day an entry is grouped under', () => {
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

test('bulk-imported entries stay on their Basecamp date', () => {
  const imported = { ...entry(1, 10, '2026-10-27', 1.5), createdAt: '2026-10-29T04:52:00Z' }
  assert.equal(groupByDay([imported], { timeZone: 'UTC' })[0].date, '2026-10-27')
})

test('an entry created the next day still follows the zone', () => {
  const nextDay = { ...entry(1, 10, '2026-11-04', 1), createdAt: '2026-11-05T02:00:00Z' }
  assert.equal(groupByDay([nextDay], { timeZone: 'UTC' })[0].date, '2026-11-05')
})

test('grouping leaves the entries themselves unchanged', () => {
  const original = { ...entry(1, 10, '2026-11-05', 1), createdAt: '2026-11-04T23:12:00Z' }
  const copy = { ...original }
  const [day] = groupByDay([original], { timeZone: 'UTC' })
  assert.deepEqual(day.rows[0].entries[0], copy)
})
