import { execFile } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  shell,
} from 'electron'
import { resolveDshEntry, startDshService } from './dsh-service.js'
import { buildAppMenuTemplate } from './app-menu.js'
import { applyMacTitleBarStyle } from './mac-titlebar.js'
import { initAutoUpdater } from './updater.js'
import { hidePluginLoadingScreen } from './hide-plugin-loading.js'
import { waitForWebUiReady } from './webui-ready.js'
import { createWindowOptions } from './window-options.js'
import {
  bundledDshVersion,
  installDshVersion,
  listInstalledVersions,
  readInstalledFamily,
  versionsDirFor,
} from './dsh-versions.js'
import { fetchDshCatalog } from './dsh-registry.js'
import { readDshState, writeDshState } from './dsh-state.js'
import {
  addPlugin,
  listInstalledPlugins,
  removePlugin,
  resolvePluginPnpmEnv,
  validatePluginSpec,
} from './dsh-plugins.js'
import { DSH_ANY_VERSION_PATTERN, isNewerVersion, sortDshVersions } from './updater-config.js'

const APP_NAME = 'DeepSeek Harness'
const execFileAsync = promisify(execFile)

let mainWindow
let service
let serviceUrl
let isQuitting = false
let isRestartingService = false
let updater
let resolvedUserPath
let versionsDir
let versionState = { selectedVersion: null, dismissedLatest: null }
let catalog = { latest: null, versions: [] }
let catalogError = null
let managerWindow
let installing = false
let pluginBusy = false

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
  mainWindow = new BrowserWindow(createWindowOptions(process.platform, nativeTheme.shouldUseDarkColors))

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
    // No tray icon anymore: on macOS keep the app running in the dock and
    // hide the window on close (reopen via the dock); elsewhere closing the
    // window quits the app.
    if (process.platform === 'darwin' && !isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
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

function createUpdater() {
  updater = initAutoUpdater({
    appName: APP_NAME,
    getMainWindow: () => mainWindow,
    onBeforeInstall: () => {
      isQuitting = true
      service?.stop()
    },
  })
}

function createAppMenu() {
  if (process.platform !== 'darwin') return
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildAppMenuTemplate({
    appName: APP_NAME,
    onCheckForUpdates: () => void updater?.checkForUpdates({ manual: true }),
    onRestartService: () => void restartDshService(),
    onOpenVersionManager: () => openVersionManagerWindow(),
  })))
}

/** The bundled version plus every validated user-installed version. */
function installedVersionList() {
  const bundled = bundledDshVersion()
  const entries = [
    ...(bundled ? [{ version: bundled, source: 'bundled' }] : []),
    ...listInstalledVersions(versionsDir),
  ]
  const seen = new Set()
  return entries
    .filter((item) => (seen.has(item.version) ? false : (seen.add(item.version), true)))
    .map((item) => {
      if (item.source !== 'installed') return item
      return { ...item, family: readInstalledFamily(path.join(versionsDir, item.version), item.version) }
    })
}

function ensureSelection() {
  const versions = installedVersionList()
  if (versionState.selectedVersion && versions.some((item) => item.version === versionState.selectedVersion)) return
  versionState.selectedVersion = sortDshVersions(versions.map((item) => item.version))[0] ?? null
}

function versionManagerSnapshot() {
  const byVersion = new Map(catalog.versions.map((item) => [item.version, item]))
  return {
    appVersion: app.getVersion(),
    selectedVersion: versionState.selectedVersion,
    latestVersion: catalog.latest,
    dismissedLatest: versionState.dismissedLatest,
    autoFollowLatest: versionState.autoFollowLatest,
    installedVersions: installedVersionList(),
    availableVersions: sortDshVersions(catalog.versions.map((item) => item.version)).map((version) => ({
      version,
      publishedAt: byVersion.get(version)?.publishedAt ?? null,
    })),
    error: catalogError,
  }
}

async function refreshCatalog() {
  try {
    catalog = await fetchDshCatalog()
    catalogError = null
  } catch (error) {
    catalogError = error instanceof Error ? error.message : '检查版本失败'
  }
}

function maybeNotifyDshUpdate() {
  const latest = catalog.latest
  const selected = versionState.selectedVersion
  if (!latest || !selected || versionState.dismissedLatest === latest) return
  if (!isNewerVersion(latest, selected)) return
  void dialog
    .showMessageBox({
      type: 'info',
      title: '发现新的 DSH 版本',
      message: `官方 DSH ${latest} 已发布（当前 ${selected}）。`,
      detail: '可在“dsh 版本管理”中安装并切换版本。',
      buttons: ['知道了', '打开版本管理'],
      defaultId: 1,
    })
    .then(({ response }) => {
      if (response === 1) openVersionManagerWindow()
      else versionState.dismissedLatest = latest
      writeDshState(app.getPath('userData'), versionState)
    })
}

function openVersionManagerWindow() {
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.show()
    managerWindow.focus()
    return
  }
  managerWindow = new BrowserWindow({
    width: 720,
    height: 640,
    minWidth: 560,
    minHeight: 460,
    title: 'dsh 版本管理',
    show: false,
    backgroundColor: '#f6f7f9',
    webPreferences: {
      preload: fileURLToPath(new URL('./version-manager-preload.cjs', import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  managerWindow.once('ready-to-show', () => managerWindow.show())
  managerWindow.on('closed', () => {
    managerWindow = undefined
  })
  managerWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  void managerWindow.loadFile(fileURLToPath(new URL('./version-manager-ui/index.html', import.meta.url)))
}

function registerVersionManagerIpc() {
  ipcMain.handle('dsh-versions:snapshot', (event) => {
    assertManagerSender(event)
    return versionManagerSnapshot()
  })
  ipcMain.handle('dsh-versions:refresh', async (event) => {
    assertManagerSender(event)
    await refreshCatalog()
    return versionManagerSnapshot()
  })
  ipcMain.handle('dsh-versions:install', async (event, version) => {
    assertManagerSender(event)
    if (installing) throw new Error('已有 DSH 版本正在安装')
    if (typeof version !== 'string') throw new Error('无效的版本号')
    installing = true
    try {
      if (catalog.versions.length === 0) await refreshCatalog()
      await installDshVersion({
        versionsDir,
        version,
        availableVersions: catalog.versions.map((item) => item.version),
        env: {
          ...process.env,
          ...(resolvedUserPath !== undefined ? { PATH: resolvedUserPath } : {}),
          NODE_OPTIONS: '',
        },
        onProgress: (progress) => managerWindow?.webContents.send('dsh-versions:progress', progress),
      })
      if (!versionState.selectedVersion) {
        versionState.selectedVersion = version
        writeDshState(app.getPath('userData'), versionState)
      }
      return versionManagerSnapshot()
    } finally {
      installing = false
    }
  })
  ipcMain.handle('dsh-versions:select', async (event, version) => {
    assertManagerSender(event)
    if (typeof version !== 'string') throw new Error('无效的版本号')
    if (!installedVersionList().some((item) => item.version === version)) throw new Error('该版本尚未安装')
    versionState.selectedVersion = version
    writeDshState(app.getPath('userData'), versionState)
    await restartDshService()
    return versionManagerSnapshot()
  })
  ipcMain.handle('dsh-versions:uninstall', (event, version) => {
    assertManagerSender(event)
    if (typeof version !== 'string' || !DSH_ANY_VERSION_PATTERN.test(version)) {
      throw new Error('无效的版本号')
    }
    if (version === versionState.selectedVersion) throw new Error('请先切换到其他版本，再卸载当前版本')
    const target = path.join(versionsDir, version)
    if (path.dirname(target) !== versionsDir || !existsSync(target)) throw new Error('该版本未安装')
    rmSync(target, { recursive: true, force: true })
    return versionManagerSnapshot()
  })
  ipcMain.handle('dsh-versions:set-auto-follow', (event, value) => {
    assertManagerSender(event)
    if (typeof value !== 'boolean') throw new Error('无效的自动跟随设置')
    versionState.autoFollowLatest = value
    writeDshState(app.getPath('userData'), versionState)
    return versionManagerSnapshot()
  })
}

function assertManagerSender(event) {
  if (!managerWindow || event.sender !== managerWindow.webContents) throw new Error('拒绝未知窗口调用')
}

function pluginCommandEnv() {
  return resolvePluginPnpmEnv({
    env: {
      ...process.env,
      ...(resolvedUserPath !== undefined ? { PATH: resolvedUserPath } : {}),
      NODE_OPTIONS: '',
    },
  })
}

function readPluginList() {
  return listInstalledPlugins({
    electronExecutable: process.execPath,
    entry: currentDshEntry(),
    env: pluginCommandEnv(),
  })
}

function registerPluginManagerIpc() {
  ipcMain.handle('dsh-plugins:list', async (event) => {
    assertManagerSender(event)
    if (pluginBusy) return { plugins: [], raw: '', error: '插件操作进行中，请稍候' }
    try {
      return await readPluginList()
    } catch (error) {
      return { plugins: [], raw: '', error: error instanceof Error ? error.message : '读取插件列表失败' }
    }
  })
  const runPluginMutation = async (event, spec, mutate) => {
    assertManagerSender(event)
    if (pluginBusy) throw new Error('已有插件操作进行中')
    if (!validatePluginSpec(spec)) throw new Error('无效的插件名')
    pluginBusy = true
    try {
      const result = await mutate(spec)
      if (result.code !== 0) {
        throw new Error(`${result.stderr || result.stdout}`.trim().slice(-800))
      }
      await restartDshService()
      return readPluginList()
    } finally {
      pluginBusy = false
    }
  }
  ipcMain.handle('dsh-plugins:add', (event, spec) =>
    runPluginMutation(event, spec, (value) =>
      addPlugin({
        electronExecutable: process.execPath,
        entry: currentDshEntry(),
        spec: value,
        env: pluginCommandEnv(),
      }),
    ),
  )
  ipcMain.handle('dsh-plugins:remove', (event, spec) =>
    runPluginMutation(event, spec, (value) =>
      removePlugin({
        electronExecutable: process.execPath,
        entry: currentDshEntry(),
        spec: value,
        env: pluginCommandEnv(),
      }),
    ),
  )
}

/**
 * With auto-follow enabled, install and select the newest official RC in the
 * background once the catalog is loaded, then restart the service so the new
 * runtime (and its aligned plugin family) takes effect.
 */
async function followLatestIfEnabled() {
  if (!versionState.autoFollowLatest) return
  const latest = catalog.latest
  const selected = versionState.selectedVersion
  if (!latest || !selected || !isNewerVersion(latest, selected)) return
  if (installing || isRestartingService) return
  installing = true
  try {
    await installDshVersion({
      versionsDir,
      version: latest,
      availableVersions: catalog.versions.map((item) => item.version),
      env: {
        ...process.env,
        ...(resolvedUserPath !== undefined ? { PATH: resolvedUserPath } : {}),
        NODE_OPTIONS: '',
      },
    })
    versionState.selectedVersion = latest
    writeDshState(app.getPath('userData'), versionState)
    console.log(`[auto-follow] DSH ${latest} installed and selected`)
    await restartDshService()
  } catch (error) {
    console.warn(`[auto-follow] install of DSH ${latest} failed:`, error instanceof Error ? error.message : error)
  } finally {
    installing = false
  }
}

function currentDshEntry() {
  return resolveDshEntry(versionState.selectedVersion, versionsDir)
}

function startHarnessService({ userPath = resolvedUserPath } = {}) {
  service = startDshService({
    electronExecutable: process.execPath,
    entry: currentDshEntry(),
    environment: {
      ...process.env,
      ...(userPath !== undefined ? { PATH: userPath } : {}),
      NODE_OPTIONS: '',
      DSH_DESKTOP: '1',
    },
  })
  return service
}

/**
 * Resolve the user's real shell PATH so plugins can find Homebrew, nvm,
 * pyenv and other tools that GUI launches do not inherit. Falls back to the
 * well-known user bin directories when the shell cannot be read.
 */
async function loadUserPath() {
  if (process.platform !== 'darwin') return undefined
  try {
    const { stdout } = await execFileAsync('/bin/zsh', ['-ilc', 'print -r -- "$PATH"'], {
      timeout: 3_000,
    })
    const shellPath = String(stdout ?? '').trim()
    if (shellPath !== '') return shellPath
  } catch {
    // Shell profile unavailable or too slow; fall through to known dirs.
  }
  const parts = (process.env.PATH ?? '').split(path.delimiter).filter((part) => part !== '')
  for (const dir of ['/opt/homebrew/bin', '/usr/local/bin', path.join(homedir(), '.local', 'bin')]) {
    if (!parts.includes(dir)) parts.push(dir)
  }
  return parts.join(path.delimiter)
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
    watchServiceExit()
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

/**
 * When the dsh host exits on its own (e.g. dshmarket's self-restart kills the
 * host and spawns a detached replacement), the shell must stay the single
 * supervisor: drop the stray replacement and restart the host in place, then
 * reload the window so plugin changes take effect.
 */
function watchServiceExit() {
  const current = service
  current.child.on('exit', () => {
    if (isQuitting || isRestartingService) return
    setTimeout(() => {
      if (isQuitting || isRestartingService) return
      const pattern = currentDshEntry()
      execFile('pkill', ['-f', pattern], (error) => {
        if (error && error.code !== 1) {
          console.warn('cleanup of detached dsh host failed:', error)
        }
        setTimeout(() => {
          void restartDshService()
        }, 500)
      })
    }, 2500)
  })
}

async function launch() {
  try {
    createUpdater()
    createAppMenu()
  } catch (error) {
    console.warn(`Shell setup failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  resolvedUserPath = await loadUserPath()
  versionsDir = versionsDirFor(app.getPath('userData'))
  versionState = readDshState(app.getPath('userData'))
  ensureSelection()
  writeDshState(app.getPath('userData'), versionState)
  registerVersionManagerIpc()
  registerPluginManagerIpc()
  startHarnessService()
  watchServiceExit()

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

  void refreshCatalog()
    .then(() => followLatestIfEnabled())
    .then(() => maybeNotifyDshUpdate())
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
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  service?.stop()
})
