const MODIFIER_ONLY = /^(Control|Shift|Alt|Meta|OS)(Left|Right)$/

const NAMED_KEYS = {
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
}

function keyName(code) {
  const match = code.match(/^(?:Key|Digit)(.)$/)
  if (match) return match[1]
  if (/^F\d{1,2}$/.test(code)) return code
  return NAMED_KEYS[code] ?? null
}

// Returns null until the event is a usable shortcut. Ctrl, Alt or Win is required
// (F-keys excepted) so a global shortcut can't swallow normal typing.
export function toAccelerator({ code, ctrlKey, shiftKey, altKey, metaKey }) {
  if (MODIFIER_ONLY.test(code)) return null
  const key = keyName(code)
  if (!key) return null
  if (!ctrlKey && !altKey && !metaKey && !/^F\d/.test(key)) return null

  const parts = []
  if (ctrlKey) parts.push('CommandOrControl')
  if (shiftKey) parts.push('Shift')
  if (altKey) parts.push('Alt')
  if (metaKey) parts.push('Super')
  return [...parts, key].join('+')
}

export function hotkeyLabel(accelerator) {
  return accelerator.replace('CommandOrControl', 'Ctrl').replace('Super', 'Win')
}

const ZONES = [
  ['Pago Pago', 'Pacific/Pago_Pago'],
  ['Honolulu', 'Pacific/Honolulu'],
  ['Anchorage', 'America/Anchorage'],
  ['Los Angeles', 'America/Los_Angeles'],
  ['Vancouver', 'America/Vancouver'],
  ['Denver', 'America/Denver'],
  ['Phoenix', 'America/Phoenix'],
  ['Chicago', 'America/Chicago'],
  ['Mexico City', 'America/Mexico_City'],
  ['New York', 'America/New_York'],
  ['Toronto', 'America/Toronto'],
  ['Bogotá', 'America/Bogota'],
  ['Santo Domingo', 'America/Santo_Domingo'],
  ['Caracas', 'America/Caracas'],
  ['Halifax', 'America/Halifax'],
  ["St. John's", 'America/St_Johns'],
  ['São Paulo', 'America/Sao_Paulo'],
  ['Buenos Aires', 'America/Argentina/Buenos_Aires'],
  ['Azores', 'Atlantic/Azores'],
  ['UTC', 'UTC'],
  ['London', 'Europe/London'],
  ['Lisbon', 'Europe/Lisbon'],
  ['Lagos', 'Africa/Lagos'],
  ['Paris', 'Europe/Paris'],
  ['Berlin', 'Europe/Berlin'],
  ['Madrid', 'Europe/Madrid'],
  ['Athens', 'Europe/Athens'],
  ['Kyiv', 'Europe/Kyiv'],
  ['Cairo', 'Africa/Cairo'],
  ['Johannesburg', 'Africa/Johannesburg'],
  ['Moscow', 'Europe/Moscow'],
  ['Istanbul', 'Europe/Istanbul'],
  ['Riyadh', 'Asia/Riyadh'],
  ['Nairobi', 'Africa/Nairobi'],
  ['Tehran', 'Asia/Tehran'],
  ['Dubai', 'Asia/Dubai'],
  ['Baku', 'Asia/Baku'],
  ['Kabul', 'Asia/Kabul'],
  ['Karachi', 'Asia/Karachi'],
  ['Tashkent', 'Asia/Tashkent'],
  ['Kolkata', 'Asia/Kolkata'],
  ['Kathmandu', 'Asia/Kathmandu'],
  ['Dhaka', 'Asia/Dhaka'],
  ['Bangkok', 'Asia/Bangkok'],
  ['Jakarta', 'Asia/Jakarta'],
  ['Singapore', 'Asia/Singapore'],
  ['Hong Kong', 'Asia/Hong_Kong'],
  ['Shanghai', 'Asia/Shanghai'],
  ['Manila', 'Asia/Manila'],
  ['Perth', 'Australia/Perth'],
  ['Tokyo', 'Asia/Tokyo'],
  ['Seoul', 'Asia/Seoul'],
  ['Adelaide', 'Australia/Adelaide'],
  ['Brisbane', 'Australia/Brisbane'],
  ['Sydney', 'Australia/Sydney'],
  ['Nouméa', 'Pacific/Noumea'],
  ['Auckland', 'Pacific/Auckland'],
  ['Apia', 'Pacific/Apia'],
]

function zonePart(timeZone, timeZoneName, date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName }).formatToParts(date)
  return parts.find((part) => part.type === 'timeZoneName').value
}

function offsetOf(timeZone, date) {
  const text = zonePart(timeZone, 'longOffset', date)
  const match = text.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!match) return { minutes: 0, label: 'UTC+00:00' }
  const [, sign, hours, minutes] = match
  return {
    minutes: Number(`${sign}1`) * (Number(hours) * 60 + Number(minutes)),
    label: `UTC${sign}${hours}:${minutes}`,
  }
}

// Offsets are computed for `date`, so the labels stay right across daylight saving.
export function timeZoneOptions(date = new Date()) {
  return ZONES.map(([city, value]) => {
    const offset = offsetOf(value, date)
    const short = zonePart(value, 'short', date)
    const suffix = /^[A-Z]{2,5}$/.test(short) && short !== 'UTC' ? ` (${short})` : ''
    return { value, minutes: offset.minutes, label: `${offset.label} ${city}${suffix}` }
  }).sort((a, b) => a.minutes - b.minutes)
}
