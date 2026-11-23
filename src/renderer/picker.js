import { errorMessage } from './format.js'

const SEARCH_DELAY_MS = 250
const MIN_REMOTE_QUERY = 2
const GAP = 4
const MIN_WIDTH = 300
const MAX_HEIGHT = 360

let open = null

export const isPickerOpen = () => Boolean(open)

const matches = (task, needle) => `${task.title} ${task.project}`.toLowerCase().includes(needle)

function createOption(task, isCurrent) {
  const option = document.createElement('button')
  option.type = 'button'
  option.className = 'picker__option'
  option.classList.toggle('is-current', isCurrent)
  const title = document.createElement('span')
  title.className = 'picker__option-title'
  title.textContent = task.title
  const project = document.createElement('span')
  project.className = 'picker__option-project'
  project.textContent = task.project
  option.append(title, project)
  return option
}

function createHeading(text) {
  const heading = document.createElement('div')
  heading.className = 'picker__heading'
  heading.textContent = text
  return heading
}

// Below the trigger when it fits, above it otherwise, and never past the window.
function place(panel, anchor) {
  const box = anchor.getBoundingClientRect()
  const width = Math.min(Math.max(box.width, MIN_WIDTH), window.innerWidth - 2 * GAP)
  const below = window.innerHeight - box.bottom - 2 * GAP
  const above = box.top - 2 * GAP
  const showAbove = below < Math.min(MAX_HEIGHT, 240) && above > below
  panel.style.width = `${width}px`
  panel.style.left = `${Math.max(GAP, Math.min(box.left, window.innerWidth - width - GAP))}px`
  panel.style.maxHeight = `${Math.min(MAX_HEIGHT, showAbove ? above : below)}px`
  panel.style.top = showAbove ? '' : `${box.bottom + GAP}px`
  panel.style.bottom = showAbove ? `${window.innerHeight - box.top + GAP}px` : ''
}

export function closePicker() {
  if (!open) return
  const { panel, anchor, onClose, cleanup } = open
  open = null
  cleanup()
  panel.remove()
  anchor.classList.remove('is-open')
  onClose?.()
}

// tasks are the recent ones, shown at once. search(query) adds Basecamp results below them.
export function openPicker(anchor, { label, current = null, tasks, search, onPick, onClose }) {
  const reopening = open?.anchor === anchor
  closePicker()
  if (reopening) return

  const panel = document.createElement('div')
  panel.className = 'picker'
  const head = document.createElement('div')
  head.className = 'picker__current'
  head.textContent = label
  const input = document.createElement('input')
  input.type = 'search'
  input.className = 'picker__search'
  input.placeholder = 'Search tasks'
  input.autocomplete = 'off'
  const results = document.createElement('div')
  results.className = 'picker__list'
  panel.append(head, input, results)
  document.body.append(panel)
  anchor.classList.add('is-open')

  let remote = { query: '', tasks: [], loading: false, error: null }
  let options = []
  let active = 0
  let timer = null

  function highlight(index) {
    options[active]?.element.classList.remove('is-active')
    active = Math.max(0, Math.min(index, options.length - 1))
    const option = options[active]
    if (!option) return
    option.element.classList.add('is-active')
    option.element.scrollIntoView({ block: 'nearest' })
  }

  function render() {
    const needle = input.value.trim().toLowerCase()
    const local = tasks.filter((task) => !needle || matches(task, needle))
    const shown = new Set(local.map((task) => task.recordingId))
    const extra = remote.query === input.value.trim() ? remote.tasks.filter((t) => !shown.has(t.recordingId)) : []
    options = []
    const children = []
    const add = (task) => {
      const element = createOption(task, task.recordingId === current?.recordingId)
      element.addEventListener('mousemove', () => highlight(options.findIndex((o) => o.element === element)))
      element.addEventListener('click', () => pick(task))
      options.push({ task, element })
      children.push(element)
    }
    if (local.length) children.push(createHeading('Recent'))
    local.forEach(add)
    if (extra.length) children.push(createHeading('Basecamp'))
    extra.forEach(add)
    const status = remote.loading ? 'Searching Basecamp…' : remote.error
    if (status) children.push(createHeading(status))
    else if (!options.length) children.push(createHeading(needle ? 'No matching tasks' : 'No recent tasks'))
    results.replaceChildren(...children)
    active = 0
    highlight(0)
  }

  function runSearch() {
    clearTimeout(timer)
    const query = input.value.trim()
    if (query.length < MIN_REMOTE_QUERY) {
      remote = { query, tasks: [], loading: false, error: null }
      return render()
    }
    remote = { ...remote, loading: true, error: null }
    render()
    timer = setTimeout(async () => {
      try {
        const found = await search(query)
        if (input.value.trim() === query) remote = { query, tasks: found, loading: false, error: null }
      } catch (err) {
        if (input.value.trim() === query) remote = { query, tasks: [], loading: false, error: errorMessage(err) }
      }
      if (open?.panel === panel) render()
    }, SEARCH_DELAY_MS)
  }

  function pick(task) {
    closePicker()
    if (task.recordingId !== current?.recordingId) onPick(task)
  }

  input.addEventListener('input', runSearch)
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') highlight(active + 1)
    else if (event.key === 'ArrowUp') highlight(active - 1)
    else if (event.key === 'Enter' && options[active]) pick(options[active].task)
    else if (event.key === 'Escape') closePicker()
    else return
    event.preventDefault()
  })

  const onPointer = ({ target }) => {
    if (!panel.contains(target) && !anchor.contains(target)) closePicker()
  }
  // Scrolling the list under a fixed panel would leave it floating away from its row.
  const onScroll = ({ target }) => {
    if (!panel.contains(target)) closePicker()
  }
  document.addEventListener('pointerdown', onPointer, true)
  document.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', closePicker)
  window.addEventListener('blur', closePicker)
  const cleanup = () => {
    clearTimeout(timer)
    document.removeEventListener('pointerdown', onPointer, true)
    document.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('resize', closePicker)
    window.removeEventListener('blur', closePicker)
  }

  open = { panel, anchor, onClose, cleanup }
  place(panel, anchor)
  render()
  input.focus()
}
