import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeImage,
  nativeTheme,
  shell,
  Tray,
} from 'electron'
import { startDshService } from './dsh-service.js'
import { buildAppMenuTemplate } from './app-menu.js'
import { applyMacTitleBarStyle } from './mac-titlebar.js'
import { initAutoUpdater } from './updater.js'
import { hidePluginLoadingScreen } from './hide-plugin-loading.js'
import { waitForWebUiReady } from './webui-ready.js'
import { createWindowOptions } from './window-options.js'
import { createTrayMenuTemplate, shouldHideWindowOnClose } from './window-lifecycle.js'

const APP_NAME = 'DeepSeek Harness'
const TRAY_ICON = fileURLToPath(new URL('../assets/tray.png', import.meta.url))
const TRAY_TEMPLATE_ICON = fileURLToPath(new URL('../assets/trayTemplate.png', import.meta.url))

let mainWindow
let service
let serviceUrl
let tray
let trayAvailable = false
let isQuitting = false
let isRestartingService = false
let updater

app.setName(APP_NAME)
app.setAboutPanelOptions({
  applicationName: APP_NAME,
  applicationVersion: app.getVersion(),
  authors: ['Krystal Cao'],
})

async function showMainWindow() {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createWindow(serviceUrl) {
  if (process.platform === 'win32') Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow(createWindowOptions(process.platform, nativeTheme.shouldUseDarkColors))

  if (process.platform === 'win32') {
    mainWindow.setMenu(null)
    mainWindow.setMenuBarVisibility(false)
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL()
    if (currentUrl && new URL(url).origin !== new URL(currentUrl).origin) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  const injectShellStyles = () => {
    if (process.platform === 'darwin') {
      void applyMacTitleBarStyle(mainWindow.webContents).catch(() => {})
    }
    void hidePluginLoadingScreen(mainWindow.webContents).catch(() => {})
  }
  injectShellStyles()
  mainWindow.webContents.on('dom-ready', injectShellStyles)

  mainWindow.on('close', (event) => {
    if (!shouldHideWindowOnClose(isQuitting, trayAvailable)) return
    event.preventDefault()
    mainWindow?.hide()
  })
  mainWindow.on('closed', () => {
    if (!mainWindow?.isDestroyed()) return
    mainWindow = undefined
  })

  return (async () => {
    await mainWindow.loadURL(serviceUrl)
    await waitForWebUiReady(mainWindow.webContents)
    if (mainWindow.isDestroyed()) return
    mainWindow.show()
    mainWindow.focus()
  })()
}

function createTray() {
  const trayIcon = nativeImage.createFromPath(
    process.platform === 'darwin' ? TRAY_TEMPLATE_ICON : TRAY_ICON,
  )
  if (process.platform === 'darwin') trayIcon.setTemplateImage(true)
  tray = new Tray(trayIcon)
  tray.setToolTip(APP_NAME)
  tray.setContextMenu(Menu.buildFromTemplate(createTrayMenuTemplate({
    locale: app.getLocale(),
    showWindow: () => void showMainWindow(),
    hideWindow: () => mainWindow?.hide(),
    checkForUpdates: () => void updater?.checkForUpdates({ manual: true }),
    quit: () => {
      isQuitting = true
      app.quit()
    },
  })))
  tray.on('click', () => void showMainWindow())
  trayAvailable = true
}

function createUpdater() {
  updater = initAutoUpdater({
    appName: APP_NAME,
    getMainWindow: () => mainWindow,
    onBeforeInstall: () => {
      isQuitting = true
      service?.stop()
    },
    setTrayTooltip: (text) => tray?.setToolTip(text || APP_NAME),
  })
}

function createAppMenu() {
  if (process.platform !== 'darwin') return
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildAppMenuTemplate({
    appName: APP_NAME,
    onCheckForUpdates: () => void updater?.checkForUpdates({ manual: true }),
    onRestartService: () => void restartDshService(),
  })))
}

function startHarnessService() {
  service = startDshService({
    electronExecutable: process.execPath,
    environment: {
      ...process.env,
      NODE_OPTIONS: '',
      DSH_DESKTOP: '1',
    },
  })
  return service
}

function stopHarnessService() {
  const current = service
  if (!current) return Promise.resolve()
  return new Promise((resolve) => {
    if (current.child.exitCode !== null || current.child.killed) {
      resolve()
      return
    }
    const timer = setTimeout(resolve, 5_000)
    current.child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    current.stop()
  })
}

async function restartDshService() {
  if (isRestartingService) return
  isRestartingService = true
  try {
    await stopHarnessService()
    const next = startHarnessService()
    const url = await next.ready
    serviceUrl = url
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(url)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await dialog.showMessageBox({
      type: 'error',
      title: '重启 dsh 服务失败',
      message: 'DeepSeek Harness 服务重启失败。',
      detail: message,
    })
  } finally {
    isRestartingService = false
  }
}

async function launch() {
  try {
    createTray()
    createUpdater()
    createAppMenu()
  } catch (error) {
    console.warn(`System tray is unavailable: ${error instanceof Error ? error.message : String(error)}`)
  }

  startHarnessService()

  try {
    serviceUrl = await service.ready
    await createWindow(serviceUrl)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await dialog.showMessageBox({
      type: 'error',
      title: `${APP_NAME} failed to start`,
      message: 'DeepSeek Harness could not start.',
      detail: message,
    })
    app.quit()
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    void showMainWindow()
  })

  app.whenReady().then(launch)
}

app.on('activate', () => {
  void showMainWindow()
})

app.on('window-all-closed', () => {
  if (isQuitting || (!trayAvailable && process.platform !== 'darwin')) app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  service?.stop()
})
