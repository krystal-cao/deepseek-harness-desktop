const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshVersions', {
  getSnapshot: () => ipcRenderer.invoke('dsh-versions:snapshot'),
  refresh: () => ipcRenderer.invoke('dsh-versions:refresh'),
  getTheme: () => ipcRenderer.invoke('dsh-versions:theme-query'),
  install: (version) => ipcRenderer.invoke('dsh-versions:install', version),
  select: (version) => ipcRenderer.invoke('dsh-versions:select', version),
  uninstall: (version) => ipcRenderer.invoke('dsh-versions:uninstall', version),
  setAutoFollow: (value) => ipcRenderer.invoke('dsh-versions:set-auto-follow', value),
  setNpmRegistry: (value) => ipcRenderer.invoke('dsh-versions:set-npm-registry', value),
  onSnapshot: (listener) => {
    const handler = (_event, snapshot) => listener(snapshot)
    ipcRenderer.on('dsh-versions:snapshot', handler)
    return () => ipcRenderer.removeListener('dsh-versions:snapshot', handler)
  },
  onTheme: (listener) => {
    const handler = (_event, theme) => listener(theme)
    ipcRenderer.on('dsh-versions:theme', handler)
    return () => ipcRenderer.removeListener('dsh-versions:theme', handler)
  },
  onProgress: (listener) => {
    const handler = (_event, progress) => listener(progress)
    ipcRenderer.on('dsh-versions:progress', handler)
    return () => ipcRenderer.removeListener('dsh-versions:progress', handler)
  },
})

contextBridge.exposeInMainWorld('dshPlugins', {
  list: () => ipcRenderer.invoke('dsh-plugins:list'),
  add: (spec) => ipcRenderer.invoke('dsh-plugins:add', spec),
  remove: (spec) => ipcRenderer.invoke('dsh-plugins:remove', spec),
})
