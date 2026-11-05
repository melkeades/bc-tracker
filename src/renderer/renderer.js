import { confirmAction } from './confirm.js'
import { errorMessage, formatDay, formatElapsed, formatHours, formatTime, groupByDay } from './format.js'
import { hotkeyLabel } from './options.js'
import { renderSettings } from './settings.js'

const CONFIRM_MS = 3000
const COPIED_MS = 1500

const $ = (id) => document.getElementById(id)
const list = $('list')
const rowTemplate = $('entry-template')
const childTemplate = $('child-template')

const view = { query: '', uniquePerDay: $('unique').checked }
let state = { running: null, last: null, pending: 0, error: null, entries: [], notice: null }
let actionError = null
let rows = new Map()
const expanded = new Set()

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

const isExpandable = (row) => view.uniquePerDay && row.entries.length > 1
const isOpen = (row) => isExpandable(row) && expanded.has(row.key)

function createRow(row) {
  const isRunning = state.running?.recordingId === row.recordingId
  const element = rowTemplate.content.firstElementChild.cloneNode(true)
  element.dataset.id = row.id
  element.dataset.key = row.key
  element.classList.toggle('is-running', isRunning)
  element.querySelector('.entry__title').textContent = row.title
  element.querySelector('.entry__meta').textContent =
    `${row.project} · ${formatTime(row.createdAt)} · ${formatHours(row.hours)}`

  const toggle = element.querySelector('.entry__toggle')
  toggle.textContent = isRunning ? '■' : '▶'
  toggle.title = isRunning ? 'Stop timer' : 'Track this task'
  toggle.classList.toggle('round--stop', isRunning)

  const expand = element.querySelector('.entry__expand')
  expand.hidden = !view.uniquePerDay
  expand.disabled = !isExpandable(row)
  expand.classList.toggle('is-open', isOpen(row))
  expand.setAttribute('aria-expanded', String(isOpen(row)))
  expand.title = !isExpandable(row) ? 'No other entries this day' : isOpen(row) ? 'Hide entries' : 'Show entries'
  return element
}

function createChild(entry) {
  const element = childTemplate.content.firstElementChild.cloneNode(true)
  element.dataset.id = entry.id
  element.querySelector('.entry__meta').textContent = `${formatTime(entry.createdAt)} · ${formatHours(entry.hours)}`
  return element
}

function createRowElements(row) {
  return [createRow(row), ...(isOpen(row) ? row.entries.map(createChild) : [])]
}

function renderList() {
  const days = groupByDay(state.entries, { ...view, timeZone: state.settings?.timeZone })
  rows = new Map(days.flatMap((day) => day.rows.map((row) => [row.key, row])))
  if (!days.length) {
    const empty = document.createElement('div')
    empty.className = 'placeholder'
    empty.textContent = state.entries.length ? 'No matching entries' : 'No time entries in the last 30 days'
    list.replaceChildren(empty)
    return
  }
  list.replaceChildren(...days.flatMap((day) => [createDay(day), ...day.rows.flatMap(createRowElements)]))
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
    act(window.bc.deleteEntries([entry.id]))
    return
  }
  button.classList.add('is-armed')
  button.textContent = 'Delete?'
  setTimeout(() => {
    button.classList.remove('is-armed')
    button.textContent = '✕'
  }, CONFIRM_MS)
}

async function deleteAll(row) {
  const count = row.entries.length
  const message =
    `Permanently delete all ${count} entries (${formatHours(row.hours)}) for "${row.title}" on ` +
    `${formatDay(row.day)}? They'll be removed from Basecamp and this can't be undone.`
  if (await confirmAction(message)) await window.bc.deleteEntries(row.entries.map((entry) => entry.id))
}

function onDeleteClick(button, element, entry) {
  const row = rows.get(element.dataset.key)
  if (row?.entries.length > 1) act(deleteAll(row))
  else deleteEntry(button, entry)
}

function toggleExpanded(key) {
  if (!expanded.delete(key)) expanded.add(key)
  renderList()
}

list.addEventListener('click', ({ target }) => {
  const element = target.closest('.entry')
  if (!element) return
  const entry = findEntry(element)
  if (target.closest('.entry__toggle')) toggleEntry(entry)
  else if (target.closest('.entry__expand')) toggleExpanded(element.dataset.key)
  else if (target.closest('.entry__delete')) onDeleteClick(target.closest('.entry__delete'), element, entry)
  else if (target.closest('.entry__body')) act(copyLink(element, entry))
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
