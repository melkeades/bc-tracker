import { errorMessage } from './format.js'
import { hotkeyLabel, timeZoneOptions, toAccelerator } from './options.js'

const $ = (id) => document.getElementById(id)
const dialog = $('settings')
const hotkeyButton = $('setting-hotkey')
const autostart = $('setting-autostart')
const timeZone = $('setting-timezone')
const message = $('settings-message')

let settings = null
let recording = false

function showMessage(text = '') {
  message.textContent = text
  message.hidden = !text
}

function fillTimeZones() {
  const options = timeZoneOptions().map(({ value, label }) => new Option(label, value))
  timeZone.replaceChildren(...options)
}

export function renderSettings(next) {
  settings = next
  autostart.checked = settings.autostartEnabled
  autostart.disabled = !settings.autostartAvailable
  $('autostart-hint').hidden = settings.autostartAvailable
  timeZone.value = settings.timeZone
  if (!recording) hotkeyButton.textContent = hotkeyLabel(settings.hotkey)
}

async function save(action) {
  showMessage()
  try {
    await action()
  } catch (err) {
    showMessage(errorMessage(err))
  }
}

function startRecording() {
  if (recording) return
  recording = true
  hotkeyButton.classList.add('is-recording')
  hotkeyButton.textContent = 'Press keys, Esc to cancel'
  showMessage()
  window.bc.pauseHotkey()
}

function finishRecording() {
  recording = false
  hotkeyButton.classList.remove('is-recording')
  hotkeyButton.textContent = hotkeyLabel(settings.hotkey)
}

function cancelRecording() {
  if (!recording) return
  finishRecording()
  window.bc.resumeHotkey()
}

async function saveHotkey(accelerator) {
  // setHotkey rebinds in the main process, and restores the old shortcut on failure.
  await save(() => window.bc.setHotkey(accelerator))
  finishRecording()
}

function onKeyDown(event) {
  if (!recording) return
  event.preventDefault()
  event.stopPropagation()
  if (event.code === 'Escape') return cancelRecording()
  const accelerator = toAccelerator(event)
  if (accelerator) saveHotkey(accelerator)
  else if (!/Control|Shift|Alt|Meta|OS/.test(event.code)) showMessage('Include Ctrl, Alt or Win, or use an F-key')
}

$('open-settings').addEventListener('click', () => {
  fillTimeZones()
  renderSettings(settings)
  showMessage()
  dialog.showModal()
})
$('close-settings').addEventListener('click', () => dialog.close())
// A click on the backdrop lands on the dialog itself. The panel covers the rest.
dialog.addEventListener('click', ({ target }) => {
  if (target === dialog) dialog.close()
})
dialog.addEventListener('cancel', (event) => {
  if (recording) event.preventDefault()
})
dialog.addEventListener('close', cancelRecording)
dialog.addEventListener('keydown', onKeyDown, true)

hotkeyButton.addEventListener('click', startRecording)
hotkeyButton.addEventListener('blur', cancelRecording)
autostart.addEventListener('change', () => save(() => window.bc.setAutostart(autostart.checked)))
timeZone.addEventListener('change', () => save(() => window.bc.setTimeZone(timeZone.value)))
