const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('bc', {
  getState: () => ipcRenderer.invoke('bc:getState'),
  start: (task) => ipcRenderer.invoke('bc:start', task),
  stop: () => ipcRenderer.invoke('bc:stop'),
  deleteEntry: (id) => ipcRenderer.invoke('bc:deleteEntry', id),
  onState: (callback) => ipcRenderer.on('bc:state', (_event, state) => callback(state)),
})
