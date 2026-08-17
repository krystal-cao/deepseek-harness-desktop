// Preload bridge for the main Harness window. Exposes a minimal
// window.dshDesktop API that the bundled dsh-desktop-host client plugin uses
// to report plugin activation and theme changes to the Electron main process.
// Runs in the isolated preload world; the page only sees the exposed surface.
const { contextBridge, ipcRenderer } = require('electron')

const state = { ready: 0, theme: 0 }

contextBridge.exposeInMainWorld('dshDesktop', {
  ready: () => {
    state.ready += 1
    ipcRenderer.send('dsh-bridge:ready')
  },
  theme: (snapshot) => {
    state.theme += 1
    ipcRenderer.send('dsh-bridge:theme', snapshot)
  },
  state: () => ({ ...state }),
})
