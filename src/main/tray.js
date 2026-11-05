const path = require('node:path')
const { Menu, Tray, nativeImage } = require('electron/main')

const ASSETS = path.join(__dirname, '..', '..', 'assets')

function icon(name, size) {
  return nativeImage.createFromPath(path.join(ASSETS, `${name}.png`)).resize({ width: size })
}

// Tray icon, tooltip, menu and the taskbar overlay, all driven by one update().
function createTray({ getWindow, onOpen, onToggle, onQuit, autostart }) {
  const images = { idle: icon('idle', 32), running: icon('running', 32), badge: icon('running', 16) }
  const tray = new Tray(images.idle)
  let running = null

  tray.on('click', onOpen)

  function buildMenu() {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: running ? `Tracking: ${running.title}` : 'Not tracking', enabled: false },
        { type: 'separator' },
        { label: running ? 'Stop timer' : 'Resume last task', click: onToggle },
        { label: 'Open', click: onOpen },
        {
          label: 'Start with Windows',
          type: 'checkbox',
          visible: autostart.available,
          checked: autostart.enabled(),
          click: (item) => autostart.set(item.checked),
        },
        { type: 'separator' },
        { label: 'Quit', click: onQuit },
      ]),
    )
  }

  buildMenu()

  return function update(state) {
    if (state.running?.recordingId === running?.recordingId) return
    running = state.running
    tray.setImage(running ? images.running : images.idle)
    // Windows caps tooltips at 127 characters.
    tray.setToolTip(running ? `BC Tracker: ${running.title}`.slice(0, 127) : 'BC Tracker')
    getWindow()?.setOverlayIcon(running ? images.badge : null, running ? 'Timer running' : 'Timer stopped')
    buildMenu()
  }
}

module.exports = { createTray }
