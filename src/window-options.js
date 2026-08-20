import { fileURLToPath } from 'node:url'

const BRIDGE_PRELOAD = fileURLToPath(new URL('./dsh-bridge-preload.cjs', import.meta.url))

export function createWindowOptions(platform = process.platform, useDarkColors = false) {
  const isMac = platform === 'darwin'

  return {
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'DSH',
    backgroundColor: isMac ? '#00000000' : useDarkColors ? '#151517' : '#ffffff',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    ...(isMac
      ? {
          trafficLightPosition: { x: 16, y: 18 },
          // Native sidebar material: MAC_TITLEBAR_CSS makes the sidebar stack
          // translucent so the vibrancy shows through there only; the content
          // columns keep their own opaque backgrounds.
          vibrancy: 'sidebar',
          visualEffectState: 'followWindow',
          transparent: true,
        }
      : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: BRIDGE_PRELOAD,
    },
  }
}
