import { confirmAction } from './confirm.js'
import { errorMessage, formatDay, formatElapsed, formatHours, formatTime, groupByDay } from './format.js'
import { hotkeyLabel } from './options.js'
import { closePicker, isPickerOpen, openPicker } from './picker.js'
import { renderSettings } from './settings.js'

const CONFIRM_MS = 3000
const COPIED_MS = 1500
const HOUR_MS = 60 * 60 * 1000

const $ = (id) => document.getElementById(id)
const list = $('list')
const rowTemplate = $('entry-template')
const childTemplate = $('child-template')

const view = { query: '', uniquePerDay: $('unique').checked, reassign: false }
let state = { running: null, last: null, pending: 0, error: null, entries: [], notice: null }
let actionError = null
let rows = new Map()
const expanded = new Set()
// Entry ids, as strings, checked in reassign mode.
const selected = new Set()
// The "Moving…" line while a move runs, or null.
let moving = null
// State that arrives while a picker is open waits, so the rows under it stay put.
let listIsStale = false

function act(promise) {
  actionError = null
  promise.catch((err) => {
    actionError = errorMessage(err)
    renderStatus()
  })
}

const runningHours = () => (state.running ? (Date.now() - state.running.startedAt) / HOUR_MS : 0)

function renderClock() {
  const { running } = state
  $('status-clock').textContent = running ? formatElapsed(Date.now() - running.startedAt) : ''
  // Only the times change, so rows, scroll position and an armed ✕ are left alone.
  for (const element of list.querySelectorAll('[data-base-hours]')) {
    element.textContent = formatHours(Number(element.dataset.baseHours) + runningHours())
  }
}

function selectedEntries() {
  return state.entries.filter((entry) => selected.has(String(entry.id)))
}

function renderStatus() {
  const { running, pending, error, notice } = state
  const picks = view.reassign ? selectedEntries() : []
  $('status').classList.toggle('is-running', Boolean(running))
  $('status-stop').hidden = !running
  $('status-text').hidden = picks.length > 0
  $('status-text').textContent =
    running?.title ?? (view.reassign ? 'Pick a task to move it, or check entries to move together' : 'No timer running')
  $('status-bulk').hidden = !picks.length
  $('status-bulk').disabled = Boolean(moving)
  const hours = picks.reduce((sum, entry) => sum + entry.hours, 0)
  $('status-bulk').firstElementChild.textContent =
    `Move ${picks.length} ${picks.length > 1 ? 'entries' : 'entry'} (${formatHours(hours)}) to…`
  $('reassign').hidden = Boolean(running)
  $('reassign').classList.toggle('is-active', view.reassign)
  $('reassign').setAttribute('aria-pressed', String(view.reassign))

  const queued = pending ? `${pending} session${pending > 1 ? 's' : ''} waiting to log. ` : ''
  const message = `${queued}${moving ?? actionError ?? error ?? notice ?? ''}`.trim()
  $('notice').textContent = message
  $('notice').hidden = !message
  renderClock()
}

function createDuration(hours, isLive) {
  const element = document.createElement('span')
  element.textContent = formatHours(hours + (isLive ? runningHours() : 0))
  if (isLive) element.dataset.baseHours = hours
  return element
}

function createDay(day) {
  const label = document.createElement('span')
  label.append(`${formatDay(day.date)} · `, createDuration(day.total, day.hasRunning))
  if (day.week) label.append(' (', createDuration(day.week.total, day.week.hasRunning), ')')
  const row = document.createElement('div')
  row.className = 'day'
  row.classList.toggle('day--week', day.endsWeek)
  row.append(label)
  return row
}

const loggedEntries = (row) => row.entries.filter((entry) => !entry.isRunning)
const taskOf = ({ recordingId, title, url, project }) => ({ recordingId, title, url, project })

function createTrigger(text) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'picker-trigger entry__picker'
  button.disabled = Boolean(moving)
  const label = document.createElement('span')
  label.className = 'picker-trigger__text'
  label.textContent = text
  button.append(label)
  return button
}

function renderCheck(element, entries) {
  const check = element.querySelector('.entry__check')
  const count = entries.filter((entry) => selected.has(String(entry.id))).length
  check.hidden = !view.reassign || !entries.length
  check.disabled = Boolean(moving)
  check.checked = entries.length > 0 && count === entries.length
  check.indeterminate = count > 0 && count < entries.length
}
const isExpandable = (row) => view.uniquePerDay && row.entries.length > 1
const isOpen = (row) => isExpandable(row) && expanded.has(row.key)

function createRow(row) {
  const isRunning = state.running?.recordingId === row.recordingId
  const element = rowTemplate.content.firstElementChild.cloneNode(true)
  element.dataset.id = row.id
  element.dataset.key = row.key
  element.classList.toggle('is-running', isRunning)
  const title = element.querySelector('.entry__title')
  if (view.reassign) title.append(createTrigger(row.title))
  else title.textContent = row.title
  renderCheck(element, loggedEntries(row))
  const details = [row.project, formatTime(row.createdAt)].filter(Boolean).join(' · ')
  element.querySelector('.entry__meta').append(`${details} · `, createDuration(row.hours, row.hasRunning))
  element.querySelector('.entry__delete').classList.toggle('is-unavailable', !loggedEntries(row).length)

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
  const label = entry.isRunning ? 'Running' : formatTime(entry.createdAt)
  element.querySelector('.entry__meta').append(`${label} · `, createDuration(entry.hours, entry.isRunning))
  if (view.reassign && !entry.isRunning) element.querySelector('.entry__body').append(createTrigger(entry.title))
  renderCheck(element, entry.isRunning ? [] : [entry])
  element.querySelector('.entry__delete').classList.toggle('is-unavailable', Boolean(entry.isRunning))
  return element
}

function createRowElements(row) {
  return [createRow(row), ...(isOpen(row) ? row.entries.map(createChild) : [])]
}

function renderList() {
  if (isPickerOpen()) {
    listIsStale = true
    return
  }
  listIsStale = false
  list.classList.toggle('is-reassigning', view.reassign)
  const days = groupByDay(state.entries, { ...view, timeZone: state.settings?.timeZone, running: state.running })
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
  // Starting a timer, from here, the hotkey or Basecamp, ends reassigning.
  if (state.running && view.reassign) setReassign(false)
  const ids = new Set(state.entries.map((entry) => String(entry.id)))
  for (const id of selected) if (!ids.has(id)) selected.delete(id)
  $('hotkey').textContent = hotkeyLabel(state.settings.hotkey)
  renderSettings(state.settings)
  renderStatus()
  renderList()
}

function findEntry(row) {
  return state.entries.find((entry) => String(entry.id) === row.dataset.id) ?? state.running
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
  const logged = loggedEntries(row)
  const message =
    `Permanently delete all ${logged.length} entries (${formatHours(row.hours)}) for "${row.title}" on ` +
    `${formatDay(row.day)}? They'll be removed from Basecamp and this can't be undone.`
  if (await confirmAction(message)) await window.bc.deleteEntries(logged.map((entry) => entry.id))
}

function onDeleteClick(button, element, entry) {
  const row = rows.get(element.dataset.key)
  if (row && loggedEntries(row).length > 1) act(deleteAll(row))
  else deleteEntry(button, entry)
}

// Newest first, one per task, from the loaded history.
function recentTasks() {
  const tasks = new Map()
  for (const entry of state.entries) if (!tasks.has(entry.recordingId)) tasks.set(entry.recordingId, taskOf(entry))
  return [...tasks.values()]
}

function setReassign(on) {
  view.reassign = on
  selected.clear()
  closePicker()
  renderStatus()
  renderList()
}

// Moved entries land in the target task's row for their day, opened so they stay in view.
function expandTargets(entries, task) {
  if (!view.uniquePerDay) return
  for (const row of rows.values()) {
    if (row.entries.some((entry) => entries.includes(entry))) expanded.add(`${row.day}:${task.recordingId}`)
  }
}

async function moveTo(entries, task) {
  const ids = entries.map((entry) => String(entry.id))
  expandTargets(entries, task)
  moving = `Moving ${ids.length} ${ids.length > 1 ? 'entries' : 'entry'} to "${task.title}"…`
  renderStatus()
  renderList()
  try {
    await window.bc.moveEntries(ids, task.recordingId)
  } finally {
    moving = null
    for (const id of ids) selected.delete(id)
    renderStatus()
    renderList()
  }
}

function showPicker(anchor, entries, label) {
  const [first] = entries
  const sameTask = entries.every((entry) => entry.recordingId === first.recordingId)
  openPicker(anchor, {
    label,
    current: sameTask ? taskOf(first) : null,
    tasks: recentTasks(),
    search: (query) => window.bc.searchTasks(query),
    onPick: (task) => act(moveTo(entries, task)),
    onClose: () => listIsStale && renderList(),
  })
}

function onPickerClick(trigger, element) {
  if (element.classList.contains('entry--child')) {
    const entry = state.entries.find((e) => String(e.id) === element.dataset.id)
    showPicker(trigger, [entry], `${entry.title} · ${formatTime(entry.createdAt)}`)
    return
  }
  const row = rows.get(element.dataset.key)
  const entries = loggedEntries(row)
  const count = entries.length > 1 ? ` · ${entries.length} entries` : ''
  showPicker(trigger, entries, `${row.title}${count}`)
}

function onCheck(check, element) {
  const row = rows.get(element.dataset.key)
  const entries = element.classList.contains('entry--child')
    ? state.entries.filter((entry) => String(entry.id) === element.dataset.id)
    : loggedEntries(row)
  for (const entry of entries) selected[check.checked ? 'add' : 'delete'](String(entry.id))
  renderStatus()
  renderList()
}

function toggleExpanded(key) {
  if (!expanded.delete(key)) expanded.add(key)
  renderList()
}

list.addEventListener('click', ({ target }) => {
  const element = target.closest('.entry')
  if (!element) return
  const entry = findEntry(element)
  if (target.closest('.entry__check')) onCheck(target.closest('.entry__check'), element)
  else if (target.closest('.entry__picker')) onPickerClick(target.closest('.entry__picker'), element)
  else if (target.closest('.entry__toggle')) toggleEntry(entry)
  else if (target.closest('.entry__expand')) toggleExpanded(element.dataset.key)
  else if (target.closest('.entry__delete')) onDeleteClick(target.closest('.entry__delete'), element, entry)
  else if (target.closest('.entry__body') && !view.reassign) act(copyLink(element, entry))
})

$('status-stop').addEventListener('click', () => act(window.bc.stop()))
$('reassign').addEventListener('click', () => setReassign(!view.reassign))
$('status-bulk').addEventListener('click', ({ currentTarget }) => {
  const entries = selectedEntries()
  const label = currentTarget.textContent.trim().replace(' to…', '')
  if (entries.length) showPicker(currentTarget, entries, label)
})

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
