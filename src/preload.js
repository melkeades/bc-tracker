const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('bc', {
  getState: () => ipcRenderer.invoke('bc:getState'),
  start: (task) => ipcRenderer.invoke('bc:start', task),
  stop: () => ipcRenderer.invoke('bc:stop'),
  deleteEntries: (ids) => ipcRenderer.invoke('bc:deleteEntries', ids),
  setAutostart: (enabled) => ipcRenderer.invoke('bc:setAutostart', enabled),
  setHotkey: (accelerator) => ipcRenderer.invoke('bc:setHotkey', accelerator),
  setTimeZone: (timeZone) => ipcRenderer.invoke('bc:setTimeZone', timeZone),
  pauseHotkey: () => ipcRenderer.invoke('bc:pauseHotkey'),
  resumeHotkey: () => ipcRenderer.invoke('bc:resumeHotkey'),
  onState: (callback) => ipcRenderer.on('bc:state', (_event, state) => callback(state)),
})
