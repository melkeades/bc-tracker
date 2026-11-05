const path = require('node:path')
const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron/main')
const { Basecamp, loadConfig } = require('./basecamp')
const { createBridge } = require('./bridge')
const { DEFAULT_HOTKEY, DEFAULT_TIME_ZONE, PORT } = require('./constants')
const { createStore } = require('./store')
const { Tracker } = require('./tracker')
const { createTray } = require('./tray')

const RETRY_MS = 60 * 1000
const QUIT_FLUSH_MS = 3000
const ENTRIES_MIN_AGE_MS = 30 * 1000

let win = null
let tracker = null
let api = null
let tray = null
let autostart = null
let settingsStore = null
let settings = null
let entries = []
let entriesFetchedAt = 0
// startupProblem lasts for the whole run. notice clears on the next good refresh.
let startupProblem = null
let hotkeyProblem = null
let notice = null
let quitting = false

function publicState() {
  const state = tracker ? tracker.state : { running: null, last: null, pending: 0, error: null }
  return {
    ...state,
    entries,
    notice: startupProblem ?? hotkeyProblem ?? notice,
    settings: {
      hotkey: settings.hotkey,
      timeZone: settings.timeZone,
      autostartAvailable: autostart.available,
      autostartEnabled: autostart.enabled(),
    },
  }
}

function publish() {
  win?.webContents.send('bc:state', publicState())
}

function showWindow() {
  win.show()
  win.focus()
}

function createWindow({ hidden }) {
  win = new BrowserWindow({
    width: 720,
    height: 520,
    minWidth: 420,
    minHeight: 300,
    show: !hidden,
    backgroundColor: '#17191b',
    icon: path.join(__dirname, '..', '..', 'assets', 'running.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  })
  // Without this, pressing Alt while recording a shortcut pops up the menu bar.
  win.removeMenu()
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))

  // Closing keeps the app in the tray so the extension and hotkey keep working.
  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    win.hide()
  })
  win.on('show', () => refreshEntries())
  win.on('focus', () => refreshEntries())
  // Windows skips before-quit on shutdown or logout. Closing here keeps an
  // overnight timer from counting hours the machine was off.
  win.on('session-end', () => tracker?.stop())
}

async function refreshEntries({ force = false } = {}) {
  if (!api) return
  if (!force && Date.now() - entriesFetchedAt < ENTRIES_MIN_AGE_MS) return
  entriesFetchedAt = Date.now()
  try {
    entries = await api.entries()
    notice = null
  } catch (err) {
    notice = `Couldn't load entries: ${err.message}`
  }
  publish()
}

async function deleteEntries(ids) {
  let deleted = 0
  try {
    for (const id of ids) {
      await api.deleteEntry(id)
      deleted += 1
    }
  } catch (err) {
    throw new Error(`Deleted ${deleted} of ${ids.length}: ${err.message}`)
  } finally {
    await refreshEntries({ force: true })
  }
}

function loadSettings() {
  const file = path.join(app.getPath('userData'), 'settings.json')
  settingsStore = createStore(file, {
    autostartSet: false,
    hotkey: DEFAULT_HOTKEY,
    timeZone: DEFAULT_TIME_ZONE,
  })
  settings = settingsStore.load()
}

function updateSettings(change) {
  settings = { ...settings, ...change }
  settingsStore.save(settings)
  publish()
}

function createAutostart() {
  // Inside a portable build execPath is a temp folder, not the real .exe.
  const options = { path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: ['--hidden'] }
  autostart = {
    available: app.isPackaged,
    enabled: () => app.getLoginItemSettings(options).openAtLogin,
    set: (openAtLogin) => app.setLoginItemSettings({ ...options, openAtLogin }),
  }
  if (app.isPackaged && !settings.autostartSet) {
    autostart.set(true)
    updateSettings({ autostartSet: true })
  }
}

function setAutostart(enabled) {
  autostart.set(enabled)
  tray?.refreshMenu()
  publish()
}

function bindHotkey(accelerator) {
  globalShortcut.unregisterAll()
  try {
    return globalShortcut.register(accelerator, toggle)
  } catch {
    return false
  }
}

function setHotkey(accelerator) {
  if (!bindHotkey(accelerator)) {
    bindHotkey(settings.hotkey)
    throw new Error('That shortcut is taken by another app')
  }
  hotkeyProblem = null
  updateSettings({ hotkey: accelerator })
}

function setTimeZone(timeZone) {
  // Throws on anything that isn't a real zone.
  new Intl.DateTimeFormat('en-US', { timeZone })
  updateSettings({ timeZone })
}

function startBridge() {
  const bridge = createBridge(tracker)
  bridge.on('error', (err) => {
    startupProblem = `Browser button unavailable, port ${PORT}: ${err.code}`
    publish()
  })
  bridge.listen(PORT, '127.0.0.1')
}

function registerIpc() {
  const run = (fn) => async (_event, ...args) => {
    if (!tracker) throw new Error(startupProblem)
    return fn(...args)
  }
  ipcMain.handle('bc:getState', () => publicState())
  ipcMain.handle('bc:start', run((task) => tracker.start(task)))
  ipcMain.handle('bc:stop', run(() => tracker.stop()))
  ipcMain.handle('bc:deleteEntries', run(deleteEntries))
  ipcMain.handle('bc:setAutostart', (_event, enabled) => setAutostart(enabled))
  ipcMain.handle('bc:setHotkey', (_event, accelerator) => setHotkey(accelerator))
  ipcMain.handle('bc:setTimeZone', (_event, timeZone) => setTimeZone(timeZone))
  // Paused while recording, or pressing the current combo would toggle the timer.
  ipcMain.handle('bc:pauseHotkey', () => globalShortcut.unregisterAll())
  ipcMain.handle('bc:resumeHotkey', () => bindHotkey(settings.hotkey))
}

function toggle() {
  tracker?.toggle(entries[0]).catch((err) => {
    notice = err.message
    publish()
  })
}

function setupTracker() {
  try {
    api = new Basecamp(loadConfig())
  } catch (err) {
    startupProblem = err.message
    return
  }
  const store = createStore(path.join(app.getPath('userData'), 'timer.json'), {})
  tracker = new Tracker({ api, store })
  tracker.on('change', (state) => {
    tray?.update(state)
    publish()
  })
  tracker.on('logged', () => refreshEntries({ force: true }))
  tracker.flush()
  setInterval(() => tracker.flush(), RETRY_MS)
  startBridge()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)

  app.on('before-quit', (event) => {
    if (quitting) return
    quitting = true
    if (!tracker) return
    event.preventDefault()
    const timeout = new Promise((resolve) => setTimeout(resolve, QUIT_FLUSH_MS))
    Promise.race([tracker.stop(), timeout]).finally(() => app.quit())
  })

  app.on('will-quit', () => globalShortcut.unregisterAll())

  app.whenReady().then(() => {
    loadSettings()
    createAutostart()
    registerIpc()
    setupTracker()
    createWindow({ hidden: process.argv.includes('--hidden') })
    tray = createTray({
      getWindow: () => win,
      onOpen: showWindow,
      onToggle: toggle,
      onQuit: () => app.quit(),
      onAutostart: setAutostart,
      autostart,
    })
    if (tracker) tray.update(tracker.state)
    if (!bindHotkey(settings.hotkey)) hotkeyProblem = "Your shortcut is taken by another app. Pick a new one in settings."
    refreshEntries({ force: true })
  })
}
