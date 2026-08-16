export function createWindowOptions(platform = process.platform, useDarkColors = false) {
  const isMac = platform === 'darwin'

  return {
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'DeepSeek Harness',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    ...(isMac
      ? {
          trafficLightPosition: { x: 16, y: 18 },
          vibrancy: 'sidebar',
          visualEffectState: 'followWindow',
          transparent: true,
          backgroundColor: '#00000000',
        }
      : {
          backgroundColor: useDarkColors ? '#151517' : '#ffffff',
          titleBarOverlay: false,
        }),
    autoHideMenuBar: platform === 'win32',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  }
}
