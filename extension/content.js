const FRAME_SELECTOR = 'turbo-frame[id^="timesheet_widget_recording_"]'
const BUTTON_CLASS = 'bc-tracker-btn'
const POLL_EVERY_TICKS = 3

const ICONS = {
  play: 'M4 2.5v11l9-5.5z',
  stop: 'M3.5 3.5h9v9h-9z',
}

let app = { offline: true }
let ticks = 0
// Pages whose timesheet total is out of date because their session just ended.
const staleFrames = new Set()

const recordingIdOf = (frame) => Number(frame.id.split('_').pop())
const frameOf = (recordingId) => document.getElementById(`timesheet_widget_recording_${recordingId}`)

function formatElapsed(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const pad = (n) => String(n).padStart(2, '0')
  return `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`
}

function createButton(frame) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `perma-toolbar__btn btn btn--sm btn--ghost ${BUTTON_CLASS}`
  button.dataset.recordingId = recordingIdOf(frame)

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('aria-hidden', 'true')
  svg.append(document.createElementNS('http://www.w3.org/2000/svg', 'path'))

  const label = document.createElement('span')
  button.append(svg, label)
  return button
}

function describe(recordingId) {
  if (app.offline) {
    return { icon: 'play', label: 'Start', state: 'offline', title: "BC Tracker app isn't running" }
  }
  const { running } = app
  if (!running) return { icon: 'play', label: 'Start', state: 'idle', title: 'Start tracking this task' }
  if (running.recordingId === recordingId) {
    const label = formatElapsed(Date.now() - running.startedAt)
    return { icon: 'stop', label, state: 'running', title: 'Stop and log this time' }
  }
  return { icon: 'play', label: 'Switch', state: 'other', title: `Tracking "${running.title}". Click to switch.` }
}

function render() {
  for (const button of document.querySelectorAll(`.${BUTTON_CLASS}`)) {
    const { icon, label, state, title } = describe(Number(button.dataset.recordingId))
    button.dataset.state = state
    button.disabled = state === 'offline'
    button.title = title
    button.setAttribute('aria-label', title)
    button.querySelector('path').setAttribute('d', ICONS[icon])
    button.querySelector('span').textContent = label
  }
}

// Turbo swaps the page without a reload and restores cached snapshots, so this
// re-checks on every DOM change. Clicks are delegated for the same reason.
function mount() {
  for (const frame of document.querySelectorAll(FRAME_SELECTOR)) {
    const next = frame.nextElementSibling
    if (next?.dataset.recordingId === String(recordingIdOf(frame))) continue
    if (next?.classList.contains(BUTTON_CLASS)) next.remove()
    frame.after(createButton(frame))
  }
  render()
}

// Setting src, even to the same URL, makes Turbo refetch the frame.
function reloadFrame(frame) {
  const src = frame.getAttribute('src')
  if (src) frame.setAttribute('src', src)
}

function apply(next) {
  const previous = app.running?.recordingId
  app = next
  if (previous && previous !== next.running?.recordingId) staleFrames.add(previous)

  // pending hits 0 once Basecamp has the entry. Refetching earlier would show the old total.
  if (!next.pending && !next.offline) {
    for (const recordingId of staleFrames) {
      const frame = frameOf(recordingId)
      if (frame) reloadFrame(frame)
    }
    staleFrames.clear()
  }
  render()
}

async function send(message) {
  try {
    apply(await chrome.runtime.sendMessage(message))
  } catch {
    // The extension was reloaded and this page's script is orphaned.
    apply({ offline: true })
  }
}

function currentTask(recordingId) {
  return {
    recordingId,
    title: document.title,
    url: `${location.origin}${location.pathname}`,
  }
}

function tick() {
  if (document.hidden || !document.querySelector(`.${BUTTON_CLASS}`)) return
  ticks += 1
  if (ticks % POLL_EVERY_TICKS === 0) send({ path: '/state' })
  else render()
}

document.addEventListener('click', (event) => {
  const button = event.target.closest(`.${BUTTON_CLASS}`)
  if (!button) return
  event.preventDefault()
  const recordingId = Number(button.dataset.recordingId)
  const isRunning = app.running?.recordingId === recordingId
  send(isRunning ? { path: '/stop' } : { path: '/start', task: currentTask(recordingId) })
})

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) send({ path: '/state' })
})

let scheduled = false
new MutationObserver(() => {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    mount()
  })
}).observe(document.documentElement, { childList: true, subtree: true })

mount()
send({ path: '/state' })
setInterval(tick, 1000)
