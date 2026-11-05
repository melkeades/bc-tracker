import {
  errorMessage,
  formatDay,
  formatElapsed,
  formatHours,
  formatTime,
  groupByDay,
  isLoggedLive,
} from './format.js'
import { hotkeyLabel } from './options.js'
import { renderSettings } from './settings.js'

const CONFIRM_MS = 3000
const COPIED_MS = 1500

const $ = (id) => document.getElementById(id)
const list = $('list')
const template = $('entry-template')

const view = { query: '', uniquePerDay: $('unique').checked }
let state = { running: null, last: null, pending: 0, error: null, entries: [], notice: null }
let actionError = null

function act(promise) {
  actionError = null
  promise.catch((err) => {
    actionError = errorMessage(err)
    renderStatus()
  })
}

function renderClock() {
  const { running } = state
  $('status-clock').textContent = running ? formatElapsed(Date.now() - running.startedAt) : ''
}

function renderStatus() {
  const { running, pending, error, notice } = state
  $('status').classList.toggle('is-running', Boolean(running))
  $('status-stop').hidden = !running
  $('status-text').textContent = running?.title ?? 'No timer running'

  const queued = pending ? `${pending} session${pending > 1 ? 's' : ''} waiting to log. ` : ''
  const message = `${queued}${actionError ?? error ?? notice ?? ''}`.trim()
  $('notice').textContent = message
  $('notice').hidden = !message
  renderClock()
}

function createDay(day) {
  const row = document.createElement('div')
  row.className = 'day'
  row.textContent = `${formatDay(day.date)} · ${formatHours(day.total)}`
  return row
}

function createEntry(entry) {
  const isRunning = state.running?.recordingId === entry.recordingId
  const row = template.content.firstElementChild.cloneNode(true)
  row.dataset.id = entry.id
  row.classList.toggle('is-running', isRunning)
  row.querySelector('.entry__title').textContent = entry.title
  const { timeZone } = state.settings
  const time = isLoggedLive(entry, timeZone) ? formatTime(entry.createdAt, timeZone) : null
  row.querySelector('.entry__meta').textContent = [entry.project, time, formatHours(entry.hours)]
    .filter(Boolean)
    .join(' · ')

  const toggle = row.querySelector('.entry__toggle')
  toggle.textContent = isRunning ? '■' : '▶'
  toggle.title = isRunning ? 'Stop timer' : 'Track this task'
  toggle.classList.toggle('round--stop', isRunning)
  return row
}

function renderList() {
  const days = groupByDay(state.entries, { ...view, timeZone: state.settings?.timeZone })
  if (!days.length) {
    const empty = document.createElement('div')
    empty.className = 'placeholder'
    empty.textContent = state.entries.length ? 'No matching entries' : 'No time entries in the last 30 days'
    list.replaceChildren(empty)
    return
  }
  list.replaceChildren(...days.flatMap((day) => [createDay(day), ...day.entries.map(createEntry)]))
}

function render(next) {
  state = next
  $('hotkey').textContent = hotkeyLabel(state.settings.hotkey)
  renderSettings(state.settings)
  renderStatus()
  renderList()
}

function findEntry(row) {
  return state.entries.find((entry) => String(entry.id) === row.dataset.id)
}

function toggleEntry(entry) {
  const { recordingId, title, url } = entry
  const isRunning = state.running?.recordingId === recordingId
  act(isRunning ? window.bc.stop() : window.bc.start({ recordingId, title, url }))
}

async function copyLink(row, entry) {
  await navigator.clipboard.writeText(entry.url)
  row.classList.add('is-copied')
  setTimeout(() => row.classList.remove('is-copied'), COPIED_MS)
}

// Deleting is permanent in Basecamp, so it takes a second click.
function deleteEntry(button, entry) {
  if (button.classList.contains('is-armed')) {
    button.disabled = true
    act(window.bc.deleteEntry(entry.id))
    return
  }
  button.classList.add('is-armed')
  button.textContent = 'Delete?'
  setTimeout(() => {
    button.classList.remove('is-armed')
    button.textContent = '✕'
  }, CONFIRM_MS)
}

list.addEventListener('click', ({ target }) => {
  const row = target.closest('.entry')
  if (!row) return
  const entry = findEntry(row)
  if (target.closest('.entry__toggle')) toggleEntry(entry)
  else if (target.closest('.entry__delete')) deleteEntry(target.closest('.entry__delete'), entry)
  else if (target.closest('.entry__body')) act(copyLink(row, entry))
})

$('status-stop').addEventListener('click', () => act(window.bc.stop()))

$('search').addEventListener('input', ({ target }) => {
  view.query = target.value
  renderList()
})

$('unique').addEventListener('change', ({ target }) => {
  view.uniquePerDay = target.checked
  renderList()
})

window.bc.onState(render)
window.bc.getState().then(render)
setInterval(() => {
  if (state.running && !document.hidden) renderClock()
}, 1000)
