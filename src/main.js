import { execFile } from 'node:child_process'
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
import { resolveDshEntry, resolveDshEntrySource, startDshService, unpackedPath } from './dsh-service.js'
import { buildAppMenuTemplate } from './app-menu.js'
import { applyMacTitleBarStyle } from './mac-titlebar.js'
import { initAutoUpdater } from './updater.js'
import { hidePluginLoadingScreen } from './hide-plugin-loading.js'
import { waitForWebUiReady } from './webui-ready.js'
import { createWindowOptions } from './window-options.js'
import {
  bundledDshVersion,
  cleanupStaleInstallDirs,
  installDshVersion,
  listInstalledVersions,
  readInstalledFamily,
  versionsDirFor,
} from './dsh-versions.js'
import { fetchDshCatalog } from './dsh-registry.js'
import { readDshState, writeDshState } from './dsh-state.js'
import { readUserPathCache, writeUserPathCache } from './user-path-cache.js'
import {
  addPlugin,
  formatPnpmResultError,
  updatePlugin,
  ensureProfilePnpmWorkspaceConfig,
  listInstalledPlugins,
  listPluginUpdates,
  profileLocalSpecIsMissing,
  removePlugin,
  repointLocalSpec,
  resolvePluginPnpmEnv,
  runDshPluginCommand,
} from './dsh-plugins.js'
import { createPluginManagerApi } from './plugin-manager-ipc.js'
import { createVersionManagerApi } from './version-manager-api.js'
import { isNewerVersion, resolveNpmRegistry, sortDshVersions } from './updater-config.js'

const APP_NAME = 'DeepSeek Harness'
const DESKTOP_HOST_PLUGIN = 'dsh-desktop-host'
// the file: install target for the bundled bridge plugin. When asar is on the
// bundle is unpacked under app.asar.unpacked; pnpm needs a real on-disk path.
const DESKTOP_HOST_BUNDLE_PATH = unpackedPath(
  fileURLToPath(new URL('../assets/dsh-desktop-host', import.meta.url)),
)
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
let currentColorScheme = null

// Mutable busy state shared between the version-manager IPC surface and the
// auto-follow path: both install versions, so both must respect the same
// in-flight guard and report the same "installing" version to the UI.
const versionBusyState = { installing: false, installingVersion: null }

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
    let target
    try {
      target = new URL(url)
    } catch {
      // Malformed or non-URL navigation (e.g. javascript:): always refuse the
      // in-window navigation.
      event.preventDefault()
      return
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      event.preventDefault()
      return
    }
    const currentUrl = mainWindow?.webContents.getURL()
    if (currentUrl && target.origin !== new URL(currentUrl).origin) {
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
    mainWindow = undefined
  })

  return (async () => {
    await mainWindow.loadURL(serviceUrl)
    await waitForBridgeOrUi(mainWindow.webContents)
    if (mainWindow.isDestroyed()) return
    mainWindow.show()
    mainWindow.focus()
  })()
}

/**
 * Wait for the desktop-host client plugin to signal activation through the
 * preload bridge, falling back to the old DOM/text readiness heuristics (and
 * their timeout) so the window still opens when the bridge is missing.
 */
function waitForBridgeOrUi(webContents) {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      ipcMain.removeListener('dsh-bridge:ready', onReady)
      resolve()
    }
    const onReady = () => finish()
    ipcMain.on('dsh-bridge:ready', onReady)
    void waitForWebUiReady(webContents).then(finish)
  })
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
  const selected = versionState.selectedVersion
  const selectedSource = resolveDshEntrySource(selected, versionsDir)
  return {
    appVersion: app.getVersion(),
    selectedVersion: selected,
    // True when the selected version's installed tree is gone or corrupted, so
    // the shell silently runs the bundled dsh. The manager UI shows a warning
    // instead of pretending the user's version is still active.
    selectedVersionFallback:
      selected !== null && selectedSource === 'bundled' && selected !== bundledDshVersion(),
    bundledVersion: bundledDshVersion(),
    latestVersion: catalog.latest,
    dismissedLatest: versionState.dismissedLatest,
    autoFollowLatest: versionState.autoFollowLatest,
    npmRegistry: versionState.npmRegistry,
    installingVersion: versionBusyState.installingVersion,
    installedVersions: installedVersionList(),
    availableVersions: sortDshVersions(catalog.versions.map((item) => item.version)).map((version) => ({
      version,
      publishedAt: byVersion.get(version)?.publishedAt ?? null,
      tags: byVersion.get(version)?.tags ?? [],
    })),
    error: catalogError,
  }
}

function pushManagerSnapshot() {
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.webContents.send('dsh-versions:snapshot', versionManagerSnapshot())
  }
}

async function refreshCatalog() {
  try {
    catalog = await fetchDshCatalog({ registry: currentNpmRegistry() })
    catalogError = null
  } catch (error) {
    catalogError = error instanceof Error ? error.message : '检查版本失败'
  }
}

function currentNpmRegistry() {
  return resolveNpmRegistry(process.env, versionState.npmRegistry || undefined)
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
  const isMac = process.platform === 'darwin'
  managerWindow = new BrowserWindow({
    width: 920,
    height: 680,
    minWidth: 780,
    minHeight: 560,
    title: 'dsh 版本管理',
    show: false,
    backgroundColor: isMac ? '#00000000' : '#f6f7f9',
    titleBarStyle: 'hiddenInset',
    ...(isMac
      ? {
          trafficLightPosition: { x: 12, y: 11 },
          // Immersive manager window: native sidebar material behind a
          // translucent sidebar, like the main window.
          vibrancy: 'sidebar',
          visualEffectState: 'followWindow',
          transparent: true,
        }
      : {}),
    webPreferences: {
      preload: fileURLToPath(new URL('./version-manager-preload.cjs', import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  managerWindow.once('ready-to-show', () => managerWindow.show())
  managerWindow.webContents.once('did-finish-load', () => {
    startManagerThemeSync()
    if (currentColorScheme) managerWindow?.webContents.send('dsh-versions:theme', { colorScheme: currentColorScheme })
  })
  managerWindow.on('closed', () => {
    stopManagerThemeSync()
    managerWindow = undefined
  })
  managerWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  void managerWindow.loadFile(fileURLToPath(new URL('./version-manager-ui/index.html', import.meta.url)))
}

let managerThemeTimer = null

/** Send the resolved color scheme to the manager window when it is open. */
function syncManagerTheme(colorScheme) {
  if (colorScheme !== 'dark' && colorScheme !== 'light') return
  currentColorScheme = colorScheme
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.webContents.send('dsh-versions:theme', { colorScheme })
  }
}

/**
 * DOM fallback for the theme signal: dsh marks dark mode with the stable
 * `data-ds-dark-theme` attribute on <body>. The bridge plugin is preferred,
 * but this keeps the manager window in sync even when the bridge is missing
 * or slow to activate (e.g. right after a fresh plugin install). The poll
 * only runs while the manager window is open and at a low cadence; the
 * `dsh-bridge:theme` push is the primary signal and the poll exists purely as
 * a safety net for a missing bridge.
 */
function readMainWindowColorScheme() {
  if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve(null)
  return mainWindow.webContents
    .executeJavaScript(
      "document.body ? (document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light') : null",
      true,
    )
    .catch(() => null)
}

/** Poll the main window theme only while the manager window is open. */
function startManagerThemeSync() {
  stopManagerThemeSync()
  void readMainWindowColorScheme().then((colorScheme) => syncManagerTheme(colorScheme))
  managerThemeTimer = setInterval(() => {
    void readMainWindowColorScheme().then((colorScheme) => syncManagerTheme(colorScheme))
  }, 10_000)
}

function stopManagerThemeSync() {
  if (managerThemeTimer) {
    clearInterval(managerThemeTimer)
    managerThemeTimer = null
  }
}

function registerVersionManagerIpc() {
  const api = createVersionManagerApi({
    busyState: versionBusyState,
    snapshot: versionManagerSnapshot,
    currentNpmRegistry,
    readCatalog: () => catalog,
    refreshCatalog,
    updateState: (mutate) => {
      mutate(versionState)
      writeDshState(app.getPath('userData'), versionState)
    },
    installDshVersion,
    versionsDir,
    buildInstallEnv: () => ({
      ...process.env,
      ...(resolvedUserPath !== undefined ? { PATH: resolvedUserPath } : {}),
      NODE_OPTIONS: '',
    }),
    onProgress: (progress) => managerWindow?.webContents.send('dsh-versions:progress', progress),
    onStateChange: pushManagerSnapshot,
    installedVersionList,
    restartDshService,
  })

  ipcMain.handle('dsh-versions:snapshot', (event) => {
    assertManagerSender(event)
    return api.snapshot()
  })
  ipcMain.handle('dsh-versions:theme-query', (event) => {
    assertManagerSender(event)
    return { colorScheme: currentColorScheme ?? 'light' }
  })
  ipcMain.handle('dsh-versions:refresh', async (event) => {
    assertManagerSender(event)
    return api.refresh()
  })
  ipcMain.handle('dsh-versions:install', async (event, version) => {
    assertManagerSender(event)
    return api.install(version)
  })
  ipcMain.handle('dsh-versions:select', async (event, version) => {
    assertManagerSender(event)
    return api.select(version)
  })
  ipcMain.handle('dsh-versions:uninstall', async (event, version) => {
    assertManagerSender(event)
    return api.uninstall(version)
  })
  ipcMain.handle('dsh-versions:set-auto-follow', (event, value) => {
    assertManagerSender(event)
    return api.setAutoFollow(value)
  })
  ipcMain.handle('dsh-versions:set-npm-registry', (event, value) => {
    assertManagerSender(event)
    return api.setNpmRegistry(value)
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
    registry: currentNpmRegistry(),
  }).then((result) => ({
    ...result,
    plugins: result.plugins
      .map((plugin) => ({
        ...plugin,
        managed: plugin.name === DESKTOP_HOST_PLUGIN,
      }))
      // The built-in bridge plugin is always pinned to the bottom of the list
      // so user plugins stay the focus of the manager.
      .sort((a, b) => {
        if (a.managed !== b.managed) return a.managed ? 1 : -1
        return a.name.localeCompare(b.name)
      }),
  }))
}

/**
 * Make sure the desktop host bridge plugin is installed in the web profile.
 * It is bundled with the app and installed from a local path, so this is a
 * file: install with no network dependency. Returns true when a restart was
 * triggered because the plugin was newly added.
 */
async function ensureDesktopHostPlugin() {
  try {
    const listed = await readPluginList()
    if (listed.plugins.some((plugin) => plugin.name === DESKTOP_HOST_PLUGIN)) {
      // The bridge is installed, but the manifest may still pin it to a
      // deleted build location (cleaning dist is part of every release
      // cycle). A dead file: spec breaks every pnpm add/remove/update in the
      // profile, so repoint it to this instance's bundle and reinstall.
      if (profileLocalSpecIsMissing(listed.path, DESKTOP_HOST_PLUGIN)) {
        if (repointLocalSpec(listed.path, DESKTOP_HOST_PLUGIN, DESKTOP_HOST_BUNDLE_PATH)) {
          const result = await runDshPluginCommand({
            electronExecutable: process.execPath,
            entry: currentDshEntry(),
            args: ['install'],
            env: pluginCommandEnv(),
          })
          if (result.code !== 0) {
            throw new Error(`pnpm install exited ${result.code}: ${formatPnpmResultError(result, { maxLength: 400 })}`)
          }
          await restartDshService()
          console.log('[dsh-bridge] desktop host plugin repointed to a live bundle; service restarted')
        }
      }
      return false
    }

    const result = await addPlugin({
      electronExecutable: process.execPath,
      entry: currentDshEntry(),
      spec: `file:${DESKTOP_HOST_BUNDLE_PATH}`,
      env: pluginCommandEnv(),
      registry: currentNpmRegistry(),
    })
    if (result.code !== 0) {
      throw new Error(`pnpm add exited ${result.code}: ${formatPnpmResultError(result, { maxLength: 400 })}`)
    }
    await restartDshService()
    console.log('[dsh-bridge] desktop host plugin installed; service restarted')
    return true
  } catch (error) {
    console.warn('[dsh-bridge] could not install desktop host plugin:', error instanceof Error ? error.message : error)
    return false
  }
}

function registerPluginManagerIpc() {
  const api = createPluginManagerApi({
    listPlugins: () => readPluginList(),
    mutatePlugin: {
      add: (spec) =>
        addPlugin({
          electronExecutable: process.execPath,
          entry: currentDshEntry(),
          spec,
          env: pluginCommandEnv(),
          registry: currentNpmRegistry(),
        }),
      remove: (spec) =>
        removePlugin({
          electronExecutable: process.execPath,
          entry: currentDshEntry(),
          spec,
          env: pluginCommandEnv(),
          registry: currentNpmRegistry(),
        }),
      update: (name) =>
        updatePlugin({
          electronExecutable: process.execPath,
          entry: currentDshEntry(),
          name,
          env: pluginCommandEnv(),
          registry: currentNpmRegistry(),
        }),
    },
    restartService: () => restartDshService(),
  })
  ipcMain.handle('dsh-plugins:list', (event) => {
    assertManagerSender(event)
    return api.list()
  })
  ipcMain.handle('dsh-plugins:add', (event, spec) => {
    assertManagerSender(event)
    return api.add(spec)
  })
  ipcMain.handle('dsh-plugins:remove', (event, spec) => {
    assertManagerSender(event)
    return api.remove(spec)
  })
  ipcMain.handle('dsh-plugins:outdated', async (event) => {
    assertManagerSender(event)
    if (api.busy) throw new Error('已有插件操作进行中')
    const listed = await readPluginList()
    ensureProfilePnpmWorkspaceConfig(listed.path)
    return listPluginUpdates({
      electronExecutable: process.execPath,
      entry: currentDshEntry(),
      env: pluginCommandEnv(),
    })
  })
  ipcMain.handle('dsh-plugins:update', (event, name) => {
    assertManagerSender(event)
    return api.update(name)
  })
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
  if (versionBusyState.installing || isRestartingService) return
  versionBusyState.installing = true
  versionBusyState.installingVersion = latest
  pushManagerSnapshot()
  try {
    await installDshVersion({
      versionsDir,
      version: latest,
      availableVersions: catalog.versions.map((item) => item.version),
      registry: currentNpmRegistry(),
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
    versionBusyState.installing = false
    versionBusyState.installingVersion = null
    pushManagerSnapshot()
  }
}

function currentDshEntry() {
  return resolveDshEntry(versionState.selectedVersion, versionsDir)
}

function startHarnessService({ userPath = resolvedUserPath } = {}) {
  const selected = versionState.selectedVersion
  if (selected && resolveDshEntrySource(selected, versionsDir) === 'bundled' && selected !== bundledDshVersion()) {
    console.warn(`[dsh-service] selected DSH ${selected} is unavailable; running bundled ${bundledDshVersion()}`)
  }
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
async function resolveUserPathFromShell() {
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

/**
 * The PATH the shell should use, cached across launches. Loading a login
 * shell profile can take up to three seconds, so a previously resolved value
 * is returned instantly and refreshed in the background: the running service
 * keeps the cached PATH (stable and sufficient), while the freshly resolved
 * one is persisted for the next launch and adopted by later plugin commands.
 */
async function loadUserPath() {
  if (process.platform !== 'darwin') return undefined
  const userData = app.getPath('userData')
  const cached = readUserPathCache(userData)
  if (cached !== null) {
    void resolveUserPathFromShell()
      .then((fresh) => {
        writeUserPathCache(userData, fresh)
        resolvedUserPath = fresh
      })
      .catch(() => {})
    return cached
  }
  const fresh = await resolveUserPathFromShell()
  writeUserPathCache(userData, fresh)
  return fresh
}

function stopHarnessService() {
  const current = service
  if (!current) return Promise.resolve()
  return new Promise((resolve) => {
    if (current.child.exitCode !== null || current.child.killed) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      // The child ignored SIGTERM (hung thread, deadlock, ...): escalate to
      // SIGKILL so a stale dsh host can never hold the loopback port while a
      // replacement starts.
      try {
        current.child.kill('SIGKILL')
      } catch {
        // Already gone.
      }
      resolve()
    }, 5_000)
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
      // Do not block callers (version switch, plugin add/remove/update) on the
      // web UI reload: the host is already ready, the reload finishes in the
      // background and the bridge reports readiness when the UI is up.
      void mainWindow.loadURL(url).catch((error) => {
        console.warn('main window reload after service restart failed:', error)
      })
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
  ipcMain.on('dsh-bridge:ready', () => {
    console.log('[dsh-bridge] web plugins activated')
  })
  ipcMain.on('dsh-bridge:theme', (_event, snapshot) => {
    const colorScheme = snapshot?.colorScheme
    if (colorScheme === 'dark' || colorScheme === 'light') {
      console.log('[dsh-bridge] theme', colorScheme)
      syncManagerTheme(colorScheme)
    }
    if (!mainWindow || mainWindow.isDestroyed()) return
    // On macOS the sidebar material handles the window background (the page is
    // translucent there); painting an opaque color would hide the vibrancy.
    if (process.platform === 'darwin') return
    if (colorScheme === 'dark' || colorScheme === 'light') {
      mainWindow.setBackgroundColor(colorScheme === 'dark' ? '#151517' : '#ffffff')
    }
  })
  try {
    createUpdater()
    createAppMenu()
  } catch (error) {
    console.warn(`Shell setup failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  resolvedUserPath = await loadUserPath()
  versionsDir = versionsDirFor(app.getPath('userData'))
  // Remove staging dirs from installs interrupted by a crash or kill; they are
  // never real versions and would otherwise accumulate forever.
  cleanupStaleInstallDirs(versionsDir)
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
      title: `${APP_NAME} 启动失败`,
      message: 'DeepSeek Harness 无法启动。',
      detail: message,
    })
    app.quit()
  }

  // Dev affordance: DSH_OPEN_MANAGER=1 opens the dsh manager window on launch
  // so the UI can be inspected without clicking through the Help menu.
  if (process.env.DSH_OPEN_MANAGER === '1') {
    setTimeout(() => openVersionManagerWindow(), 500)
  }
  void ensureDesktopHostPlugin()
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
