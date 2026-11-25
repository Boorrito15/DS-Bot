// The Servers window's only door: a list of addresses, and what the page may ask to do with
// them. The page never sees the file, only these calls, and the main process checks every id
// and address again.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dsBotServers', {
  state: () => ipcRenderer.invoke('ds-bot:servers-state'),
  add: entry => ipcRenderer.invoke('ds-bot:servers-add', entry),
  remove: id => ipcRenderer.invoke('ds-bot:servers-remove', id),
  connect: id => ipcRenderer.invoke('ds-bot:servers-connect', id),
  local: () => ipcRenderer.invoke('ds-bot:servers-local'),
  close: () => ipcRenderer.invoke('ds-bot:servers-close'),
})
