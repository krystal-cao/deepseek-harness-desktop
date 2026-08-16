const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshVersions', {
  getSnapshot: () => ipcRenderer.invoke('dsh-versions:snapshot'),
  refresh: () => ipcRenderer.invoke('dsh-versions:refresh'),
  install: (version) => ipcRenderer.invoke('dsh-versions:install', version),
  select: (version) => ipcRenderer.invoke('dsh-versions:select', version),
  uninstall: (version) => ipcRenderer.invoke('dsh-versions:uninstall', version),
  onSnapshot: (listener) => {
    const handler = (_event, snapshot) => listener(snapshot)
    ipcRenderer.on('dsh-versions:snapshot', handler)
    return () => ipcRenderer.removeListener('dsh-versions:snapshot', handler)
  },
  onProgress: (listener) => {
    const handler = (_event, progress) => listener(progress)
    ipcRenderer.on('dsh-versions:progress', handler)
    return () => ipcRenderer.removeListener('dsh-versions:progress', handler)
  },
})
