const DAY_MS = 24 * 60 * 60 * 1000

const pad = (n) => String(n).padStart(2, '0')

export function errorMessage(err) {
  return err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export function formatElapsed(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`
}

export function formatHours(hours) {
  const minutes = Math.round(hours * 60)
  return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`
}

export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
}

export function formatDay(date) {
  // Noon keeps a date-only value on the same day in every timezone.
  return new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

const zonedDate = (iso, timeZone) => new Intl.DateTimeFormat('sv-SE', { timeZone }).format(new Date(iso))

// Time zones can move a date by one day at most. Anything further apart was added
// later, like a bulk import, so its created time says nothing about when the work happened.
function isLoggedLive(entry, timeZone) {
  const gapMs = Math.abs(Date.parse(zonedDate(entry.createdAt, timeZone)) - Date.parse(entry.date))
  return gapMs <= DAY_MS
}

function entryDay(entry, timeZone) {
  return isLoggedLive(entry, timeZone) ? zonedDate(entry.createdAt, timeZone) : entry.date
}

// The running session isn't in Basecamp yet, so this display-only stand-in shows it in
// the list. It carries 0 hours: elapsed time is added at render, so it can tick.
function runningEntry({ recordingId, title, url, startedAt }, entries, timeZone) {
  const createdAt = new Date(startedAt).toISOString()
  const project = entries.find((entry) => entry.recordingId === recordingId)?.project ?? ''
  const date = zonedDate(createdAt, timeZone)
  return { id: 'running', recordingId, title, url, project, date, hours: 0, createdAt, isRunning: true }
}

// Weeks run Monday to Sunday. Working in UTC keeps date-only math clear of clock changes.
function weekStart(date) {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
  return day.toISOString().slice(0, 10)
}

// The zone can pull the oldest fetched entries back into a week that wasn't fetched,
// so any week before the oldest stored date is partial and gets no sum.
function sumWeeks(days, oldestDate) {
  const firstWeek = weekStart(oldestDate)
  const weeks = new Map()
  for (const { date, total, hasRunning } of days) {
    const key = weekStart(date)
    if (key < firstWeek) continue
    const week = weeks.get(key) ?? { total: 0, hasRunning: false }
    weeks.set(key, { total: week.total + total, hasRunning: week.hasRunning || hasRunning })
  }
  return weeks
}

// Today and the newest listed day of each week carry that week's sum. Days hidden by a
// search still count, the same way they do in the day totals.
function markWeekSums(listed, weeks, today) {
  const marked = new Set()
  for (const day of listed) {
    const key = weekStart(day.date)
    day.week = day.date === today || !marked.has(key) ? (weeks.get(key) ?? null) : null
    marked.add(key)
  }
}

// The time zone only picks the day a row sits under. It never alters entry data.
// Day totals always cover every entry, so filtering the list never changes them.
// With uniquePerDay, a row sums that task's entries for the day and shows the newest
// one's fields. Entries arrive newest first, so the first one seen is the newest.
export function groupByDay(entries, { query = '', uniquePerDay = false, timeZone, running = null, now = Date.now() } = {}) {
  const needle = query.trim().toLowerCase()
  const days = new Map()
  const all = running ? [...entries, runningEntry(running, entries, timeZone)] : entries

  for (const entry of all) {
    const isRunning = Boolean(entry.isRunning)
    const date = entryDay(entry, timeZone)
    if (!days.has(date)) days.set(date, { date, total: 0, hasRunning: false, rows: [] })
    const day = days.get(date)
    day.total += entry.hours
    day.hasRunning ||= isRunning

    if (needle && !`${entry.title} ${entry.project}`.toLowerCase().includes(needle)) continue

    const row = uniquePerDay && day.rows.find((r) => r.recordingId === entry.recordingId)
    if (row) {
      row.hours += entry.hours
      row.hasRunning ||= isRunning
      // The running line goes first in the expanded list, and the rest stay newest first.
      row.entries[isRunning ? 'unshift' : 'push'](entry)
    } else {
      const key = uniquePerDay ? `${date}:${entry.recordingId}` : String(entry.id)
      const next = { ...entry, key, day: date, hasRunning: isRunning, entries: [entry] }
      day.rows[isRunning ? 'unshift' : 'push'](next)
    }
  }

  const allDays = [...days.values()]
  const listed = allDays.filter((day) => day.rows.length).sort((a, b) => b.date.localeCompare(a.date))
  const today = zonedDate(now, timeZone)
  const oldestDate = all.map((entry) => entry.date).sort()[0] ?? today
  markWeekSums(listed, sumWeeks(allDays, oldestDate), today)
  return listed
}
