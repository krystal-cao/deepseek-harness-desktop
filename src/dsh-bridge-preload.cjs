// Preload bridge for the main Harness window. Exposes a minimal
// window.dshDesktop API that the bundled dsh-desktop-host client plugin uses
// to report plugin activation and theme changes to the Electron main process.
// Runs in the isolated preload world; the page only sees the exposed surface.
const { contextBridge, ipcRenderer } = require('electron')

const state = { ready: 0, theme: 0, notify: 0 }
const DRAG_REGION_HEIGHT = 40

/**
 * Inject the macOS window-drag strip as a real DOM node instead of a
 * body::before style rule: same geometric layering (first child, no z-index),
 * but owned by the shell's preload rather than injected CSS, so page reloads
 * and upstream CSS changes cannot drop it. Interactive elements keep working
 * through the no-drag rule in mac-titlebar.js.
 */
function installDragRegion() {
  if (!document.body || document.getElementById('dsh-drag-region')) return
  const region = document.createElement('div')
  region.id = 'dsh-drag-region'
  region.setAttribute(
    'style',
    [
      'position: fixed',
      'top: 0',
      'left: 0',
      'right: 0',
      `height: ${DRAG_REGION_HEIGHT}px`,
      '-webkit-app-region: drag',
      'app-region: drag',
    ].join(';'),
  )
  document.body.prepend(region)
}

document.addEventListener('DOMContentLoaded', installDragRegion, { once: true })

contextBridge.exposeInMainWorld('dshDesktop', {
  ready: () => {
    state.ready += 1
    ipcRenderer.send('dsh-bridge:ready')
  },
  theme: (snapshot) => {
    state.theme += 1
    ipcRenderer.send('dsh-bridge:theme', snapshot)
  },
  notify: (payload) => {
    state.notify += 1
    ipcRenderer.send('dsh-bridge:notify', payload)
  },
  debug: (message) => {
    if (typeof message !== 'string') message = JSON.stringify(message)
    ipcRenderer.send('dsh-bridge:debug', message)
  },
  state: () => ({ ...state }),
})
