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

export function formatTime(iso, timeZone) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
}

export function formatDay(date) {
  // Noon keeps a date-only value on the same day in every timezone.
  return new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

const zonedDate = (iso, timeZone) => new Intl.DateTimeFormat('sv-SE', { timeZone }).format(new Date(iso))

// Time zones can move a date by one day at most. Anything further apart was added
// later, like a bulk import, so its created time says nothing about when the work happened.
export function isLoggedLive(entry, timeZone) {
  const gapMs = Math.abs(Date.parse(zonedDate(entry.createdAt, timeZone)) - Date.parse(entry.date))
  return gapMs <= DAY_MS
}

function entryDay(entry, timeZone) {
  return isLoggedLive(entry, timeZone) ? zonedDate(entry.createdAt, timeZone) : entry.date
}

// Day totals always cover every entry, so filtering the list never changes them.
export function groupByDay(entries, { query = '', uniquePerDay = false, timeZone } = {}) {
  const needle = query.trim().toLowerCase()
  const days = new Map()

  for (const entry of entries) {
    const date = entryDay(entry, timeZone)
    if (!days.has(date)) days.set(date, { date, total: 0, entries: [] })
    const day = days.get(date)
    day.total += entry.hours

    const matches = !needle || `${entry.title} ${entry.project}`.toLowerCase().includes(needle)
    const duplicate = uniquePerDay && day.entries.some((e) => e.recordingId === entry.recordingId)
    if (matches && !duplicate) day.entries.push(entry)
  }

  return [...days.values()].filter((day) => day.entries.length).sort((a, b) => b.date.localeCompare(a.date))
}
