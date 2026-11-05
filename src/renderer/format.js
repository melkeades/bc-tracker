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

// Day totals always cover every entry, so filtering the list never changes them.
export function groupByDay(entries, { query = '', uniquePerDay = false } = {}) {
  const needle = query.trim().toLowerCase()
  const days = new Map()

  for (const entry of entries) {
    if (!days.has(entry.date)) days.set(entry.date, { date: entry.date, total: 0, entries: [] })
    const day = days.get(entry.date)
    day.total += entry.hours

    const matches = !needle || `${entry.title} ${entry.project}`.toLowerCase().includes(needle)
    const duplicate = uniquePerDay && day.entries.some((e) => e.recordingId === entry.recordingId)
    if (matches && !duplicate) day.entries.push(entry)
  }

  return [...days.values()].filter((day) => day.entries.length).sort((a, b) => b.date.localeCompare(a.date))
}
