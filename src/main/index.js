const path = require('node:path')
const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron/main')
const { Basecamp, loadConfig } = require('./basecamp')
const { createBridge } = require('./bridge')
const { HOTKEY, PORT } = require('./constants')
const { createStore } = require('./store')
const { Tracker } = require('./tracker')
const { createTray } = require('./tray')

const RETRY_MS = 60 * 1000
const QUIT_FLUSH_MS = 3000
const ENTRIES_MIN_AGE_MS = 30 * 1000

let win = null
let tracker = null
let api = null
let updateTray = () => {}
let entries = []
let entriesFetchedAt = 0
// startupProblem lasts for the whole run. notice clears on the next good refresh.
let startupProblem = null
let notice = null
let quitting = false

function publicState() {
  const state = tracker ? tracker.state : { running: null, last: null, pending: 0, error: null }
  return { ...state, entries, notice: startupProblem ?? notice, hotkey: HOTKEY.replace('CommandOrControl', 'Ctrl') }
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
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', '..', 'assets', 'running.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  })
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

function createAutostart() {
  const settings = createStore(path.join(app.getPath('userData'), 'settings.json'), { autostartSet: false })
  // Inside a portable build execPath is a temp folder, not the real .exe.
  const options = { path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: ['--hidden'] }
  const autostart = {
    available: app.isPackaged,
    enabled: () => app.getLoginItemSettings(options).openAtLogin,
    set: (openAtLogin) => app.setLoginItemSettings({ ...options, openAtLogin }),
  }
  if (app.isPackaged && !settings.load().autostartSet) {
    autostart.set(true)
    settings.save({ autostartSet: true })
  }
  return autostart
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
  ipcMain.handle(
    'bc:deleteEntry',
    run(async (id) => {
      await api.deleteEntry(id)
      await refreshEntries({ force: true })
    }),
  )
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
    updateTray(state)
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
    registerIpc()
    setupTracker()
    createWindow({ hidden: process.argv.includes('--hidden') })
    updateTray = createTray({
      getWindow: () => win,
      onOpen: showWindow,
      onToggle: toggle,
      onQuit: () => app.quit(),
      autostart: createAutostart(),
    })
    if (tracker) updateTray(tracker.state)
    if (!globalShortcut.register(HOTKEY, toggle)) startupProblem = `Hotkey ${HOTKEY} is taken by another app`
    refreshEntries({ force: true })
  })
}
