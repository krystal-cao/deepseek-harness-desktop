import { execFile } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs'
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
  Notification,
  shell,
} from 'electron'
import {
  checkPortAvailable,
  resolveDshEntry,
  resolveDshEntrySource,
  startDshService,
  supportsNoOpen,
  unpackedPath,
} from './dsh-service.js'
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
  bridgePluginInstalled,
  detectExternalThemeInProfile,
  formatPnpmResultError,
  updatePlugin,
  ensureProfilePnpmWorkspaceConfig,
  listInstalledPlugins,
  listPluginUpdates,
  localSpecTarget,
  removePlugin,
  repointLocalSpec,
  resolvePluginPnpmEnv,
  resolveWebProfileDir,
  runDshPluginCommand,
} from './dsh-plugins.js'
import { createPluginManagerApi } from './plugin-manager-ipc.js'
import { createVersionManagerApi } from './version-manager-api.js'
import { isNewerVersion, resolveNpmRegistry, sortDshVersions } from './updater-config.js'
import { migrateLegacyBundleName } from './bundle-migration.js'

const APP_NAME = 'DSH'
const DESKTOP_HOST_PLUGIN = 'dsh-desktop-host'
// the file: install target for the bundled bridge plugin. When asar is on the
// bundle is unpacked under app.asar.unpacked; pnpm needs a real on-disk path.
const DESKTOP_HOST_BUNDLE_PATH = unpackedPath(
  fileURLToPath(new URL('../assets/dsh-desktop-host', import.meta.url)),
)
const execFileAsync = promisify(execFile)

/**
 * Append a line to a diagnostic log under userData. The packaged GUI app's
 * stdout/stderr are not reachable from a terminal, so the bridge self-heal
 * writes its decisions and failures here for retrospection.
 */
function appendDiag(line) {
  try {
    appendFileSync(path.join(app.getPath('userData'), 'bridge-heal.log'), `${new Date().toISOString()} ${line}\n`)
  } catch {
    // Best effort; diagnostics must never break the app.
  }
}

/**
 * Show a macOS/Windows system notification that an agent task finished. Falls
 * back silently if notifications are unsupported (e.g. headless) or the
 * payload is empty.
 */
function showTaskDoneNotification(payload) {
  if (!payload || typeof payload !== 'object') return
  const sessionLabel = payload.title && String(payload.title).trim() ? String(payload.title).trim() : '会话'
  // Show the workspace (the cwd's basename) instead of the long absolute path.
  let workspace = null
  if (payload.cwd && typeof payload.cwd === 'string' && payload.cwd.trim() !== '') {
    const parts = payload.cwd.trim().replace(/\/+$/, '').split(/[/\\]/).filter(Boolean)
    workspace = parts.length > 0 ? parts[parts.length - 1] : null
  }
  const detail = workspace ? `工作区：${workspace}` : undefined
  try {
    const notification = new Notification({
      title: '任务完成',
      body: detail ? `${sessionLabel}\n${detail}` : sessionLabel,
      silent: false,
    })
    notification.on('click', () => showMainWindow())
    notification.show()
  } catch (error) {
    console.warn('showTaskDoneNotification failed:', error instanceof Error ? error.message : error)
  }
}

/**
 * macOS has no Electron API to query or request notification permission ahead
 * of time — the system only prompts on the first `show()`. To surface the
 * prompt at a calm moment (app launch) instead of the first time a task
 * finishes, show one unobtrusive placeholder notification on first launch and
 * remember it (via a marker file) so repeat launches do not nag.
 */
const NOTIF_WARM_MARKER = 'notif-permission-warmed'
function warmNotificationPermission() {
  try {
    if (!Notification.isSupported()) return
    const marker = path.join(app.getPath('userData'), NOTIF_WARM_MARKER)
    if (existsSync(marker)) return
    // A tiny, silent placeholder: it exists only to trigger the OS permission
    // prompt on first launch. A click does nothing (do not divert to the app).
    new Notification({ title: '', body: '', silent: true }).show()
    writeFileSync(marker, String(Date.now()), { mode: 0o600 })
  } catch (error) {
    // The permission prompt is best-effort; failures must not break startup.
    console.warn('warmNotificationPermission failed:', error instanceof Error ? error.message : error)
  }
}

let mainWindow
let mainWindowFocused = true
let service
let serviceUrl
let isQuitting = false
let stopPromise
let isRestartingService = false
let updater
let resolvedUserPath
let versionsDir
let versionState = { selectedVersion: null, dismissedLatest: null, uiTheme: 'default', translateCommands: true }
let catalog = { latest: null, versions: [] }
let catalogError = null
let managerWindow
let currentColorScheme = null
let currentExternalTheme = null
let currentLanguage = readInitialHostLanguage()

function readInitialHostLanguage() {
  try {
    const dshHome = process.env.DSH_HOME || path.join(homedir(), '.dsh')
    const settingsPath = path.join(dshHome, 'settings.yaml')
    if (existsSync(settingsPath)) {
      const content = readFileSync(settingsPath, 'utf8')
      const match = /^\s*preference:\s*['"]?(en|zh)['"]?/m.exec(content)
      if (match) return match[1]
    }
  } catch {}
  return 'zh'
}

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
  mainWindow.webContents.on('did-finish-load', () => {
    void syncMainWindowUiTheme()
    void syncMainWindowTranslateCommands()
  })

  mainWindow.on('focus', () => {
    mainWindowFocused = true
  })
  mainWindow.on('blur', () => {
    mainWindowFocused = false
  })
  mainWindow.on('show', () => {
    // A window can be shown while unfocused (e.g. programmatic show); treat a
    // freshly shown window as focused so notifications do not leak in.
    mainWindowFocused = true
  })

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
    await Promise.all([syncMainWindowUiTheme(), syncMainWindowTranslateCommands()])
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
      // onBeforeInstall triggers right before app.quit(); let quitAfterStoppingService
      // perform the graceful service shutdown when the quit lifecycle begins.
    },
  })
}

function createAppMenu() {
  if (process.platform !== 'darwin') return
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildAppMenuTemplate({
    appName: APP_NAME,
    language: currentLanguage,
    onCheckForUpdates: () => void updater?.checkForUpdates({ manual: true }),
    onRestartService: () => void restartDshService(),
    onOpenVersionManager: () => openVersionManagerWindow(),
    onOpenGithub: () => void shell.openExternal('https://github.com/krystal-cao/deepseek-harness-desktop'),
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
  const externalTheme = currentExternalTheme || detectExternalThemeInProfile()
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
    dshPort: versionState.dshPort,
    uiTheme: externalTheme ? 'default' : (versionState.uiTheme === 'claude' ? 'claude' : 'default'),
    externalTheme,
    translateCommands: versionState.translateCommands !== false,
    installingVersion: versionBusyState.installingVersion,
    installedVersions: installedVersionList(),
    availableVersions: sortDshVersions(catalog.versions.map((item) => item.version)).map((version) => ({
      version,
      publishedAt: byVersion.get(version)?.publishedAt ?? null,
      tags: byVersion.get(version)?.tags ?? [],
    })),
    error: catalogError,
    language: currentLanguage,
    colorScheme: currentColorScheme ?? 'light',
  }
}

function pushManagerSnapshot() {
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.webContents.send('dsh-versions:snapshot', versionManagerSnapshot())
  }
}

/** Apply the persisted shell theme to the live DSH Web UI without changing
 * its text, typography, layout, or interaction model. */
function syncMainWindowUiTheme() {
  if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve()
  const theme = versionState.uiTheme === 'claude' ? 'claude' : 'default'
  const serialized = JSON.stringify(theme)
  return mainWindow.webContents
    .executeJavaScript(
      `(() => {
        const theme = ${serialized};
        window.__DSH_DESKTOP_UI_THEME__ = theme;
        window.dispatchEvent(new CustomEvent('dsh-desktop-ui-theme-change', { detail: { theme } }));
      })()`,
    )
    .catch((error) => {
      // The webview may not have finished mounting the bridge yet; ignore.
      console.warn('syncMainWindowUiTheme failed:', error instanceof Error ? error.message : error)
    })
}

/** Sync the command translation preference to the live DSH Web UI. */
function syncMainWindowTranslateCommands() {
  if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve()
  const enabled = versionState.translateCommands !== false
  const serialized = JSON.stringify(enabled)
  return mainWindow.webContents
    .executeJavaScript(
      `(() => {
        const enabled = ${serialized};
        window.__DSH_DESKTOP_TRANSLATE_COMMANDS__ = enabled;
        window.dispatchEvent(new CustomEvent('dsh-desktop-translate-commands-change', { detail: { enabled } }));
      })()`,
    )
    .catch((error) => {
      // The webview may not have finished mounting the bridge yet; ignore.
      console.warn('syncMainWindowTranslateCommands failed:', error instanceof Error ? error.message : error)
    })
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
    pushManagerSnapshot()
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
    pushManagerSnapshot()
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
    // Guard: switching to a version newer than the bundled one may break
    // compatibility because the shell was built and tested against the bundled
    // release. Ask the user to confirm before proceeding.
    const bundled = bundledDshVersion()
    if (bundled && isNewerVersion(version, bundled)) {
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        title: '版本兼容性提示',
        message: `目标版本 ${version} 高于本应用内置的 DSH ${bundled}。`,
        detail: '更高版本可能尚未与本应用充分适配，存在兼容性风险。是否仍要切换？',
        buttons: ['取消', '继续切换'],
        defaultId: 0,
        cancelId: 0,
      })
      if (response !== 1) return versionManagerSnapshot()
    }
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
  ipcMain.handle('dsh-versions:set-port', async (event, value) => {
    assertManagerSender(event)
    if (value !== null && value !== 3080) {
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        title: '服务端口修改提示',
        message: `设置的端口 ${value} 与默认端口 3080 不一致。`,
        detail:
          `DSH 默认监听 3080 端口，该端口会被作为环境信息注入系统提示词。将其修改为其他端口后，历史会话重新提问时会因系统提示词变动导致大模型上下文缓存失效，从而显著增加 API 调用费用与响应延迟；同时默认连接 3080 端口的外部插件与工具也可能受到影响。\n\n` +
          `保存后需重启应用生效。是否仍要继续修改？`,
        buttons: ['取消', '仍要修改'],
        defaultId: 0,
        cancelId: 0,
      })
      if (response !== 1) return versionManagerSnapshot()
    }
    return api.setDshPort(value)
  })
  ipcMain.handle('dsh-versions:set-ui-theme', (event, value) => {
    assertManagerSender(event)
    const next = api.setUiTheme(value)
    void syncMainWindowUiTheme()
    return next
  })
  ipcMain.handle('dsh-versions:set-translate-commands', (event, value) => {
    assertManagerSender(event)
    const next = api.setTranslateCommands(value)
    void syncMainWindowTranslateCommands()
    return next
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
 * Ask the user before a bridge self-heal is allowed to restart the dsh
 * service. Restarting reloads the web UI and can interrupt in-flight work, so
 * a runtime heal (which may fire while the user is mid-task) confirms first.
 * Startup heals keep `prompt` false and restart silently. Returns true when
 * the restart should proceed now; false when the user chose to defer (the
 * plugin is already reinstalled, just not yet active).
 */
async function confirmBridgeRestart(prompt) {
  if (!prompt) return true
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: '需要重启 dsh 服务',
    message: '检测到内置桥接插件被移除，已自动重新安装。',
    detail: '重启 dsh 服务后才能生效（会重新加载当前窗口）。是否现在重启？',
    buttons: ['稍后', '立即重启'],
    defaultId: 1,
    cancelId: 0,
  })
  return response === 1
}

/**
 * Make sure the desktop host bridge plugin is installed in the web profile.
 * It is bundled with the app and installed from a local path, so this is a
 * file: install with no network dependency. Returns true when a restart was
 * triggered because the plugin was newly added (or repointed).
 *
 * `promptBeforeRestart` controls whether an automatic heal may restart the
 * service unprompted: the runtime poll passes true so the user can defer an
 * interrupting restart, while startup heals pass false and restart silently.
 */
async function ensureDesktopHostPlugin({ promptBeforeRestart = false } = {}) {
  try {
    const listed = await readPluginList()
    if (listed.plugins.some((plugin) => plugin.name === DESKTOP_HOST_PLUGIN)) {
      // The profile pins the bridge to a file: bundle. Whenever that spec no
      // longer points at THIS instance's bundle, repoint and reinstall. This
      // covers both a dead spec (dist cleaned on every release) and an app
      // that was moved or reinstalled to a new path after the spec was
      // written: the old target may still exist on disk, yet it is the wrong
      // (stale-version) bundle. A registry spec (no local target) is left
      // alone.
      const currentSpecTarget = localSpecTarget(listed.path, DESKTOP_HOST_PLUGIN)
      if (currentSpecTarget !== null && currentSpecTarget !== DESKTOP_HOST_BUNDLE_PATH) {
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
          if (await confirmBridgeRestart(promptBeforeRestart)) {
            await restartDshService()
            console.log('[dsh-bridge] desktop host plugin repointed to the running bundle; service restarted')
          } else {
            console.log('[dsh-bridge] desktop host plugin repointed; restart deferred by user')
            appendDiag('repointed; restart deferred by user')
          }
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
    appendDiag(`ensure: addPlugin exit=${result.code} spec=file:${DESKTOP_HOST_BUNDLE_PATH}`)
    if (result.code !== 0) {
      throw new Error(`pnpm add exited ${result.code}: ${formatPnpmResultError(result, { maxLength: 400 })}`)
    }
    if (await confirmBridgeRestart(promptBeforeRestart)) {
      await restartDshService()
      console.log('[dsh-bridge] desktop host plugin installed; service restarted')
      appendDiag('ensure: addPlugin ok + service restarted')
    } else {
      console.log('[dsh-bridge] desktop host plugin installed; restart deferred by user')
      appendDiag('ensure: addPlugin ok; restart deferred by user')
    }
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    appendDiag(`ensure threw: ${message}`)
    console.warn('[dsh-bridge] could not install desktop host plugin:', message)
    return false
  }
}

/**
 * Periodic self-heal for the bundled bridge plugin. A third-party plugin
 * manager (e.g. dshmarket) runs pnpm against the web profile directly and can
 * remove `dsh-desktop-host` out from under the shell — the desktop IPC guards
 * cannot block that channel, and dsh itself has no "managed" declaration. The
 * cheap profile check detects the removal and reinstalls the bridge so its
 * readiness/theme reporting (and thus the whole plugin experience) recovers
 * without waiting for an app restart.
 */
const BRIDGE_HEAL_INTERVAL_MS = 30_000
let bridgeHealTimer = null
let bridgeHealRunning = false

async function runBridgeHeal() {
  if (bridgeHealRunning || isQuitting || isRestartingService) return
  bridgeHealRunning = true
  try {
    const profileDir = resolveWebProfileDir()
    const installed = bridgePluginInstalled(profileDir, DESKTOP_HOST_PLUGIN)
    if (installed) return
    console.warn('[dsh-bridge] detected missing desktop host plugin; reinstalling')
    appendDiag('detected missing; calling ensureDesktopHostPlugin (prompting before restart)')
    await ensureDesktopHostPlugin({ promptBeforeRestart: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    appendDiag(`poll failed: ${message}\n${error instanceof Error ? error.stack : ''}`)
    console.warn('[dsh-bridge] bridge self-heal failed:', message)
  } finally {
    bridgeHealRunning = false
  }
}

function startBridgeHealPoll() {
  // Prime check shortly after launch (the startup ensure covers it, but a
  // removal right at boot should be caught without waiting a full interval),
  // then poll periodically. The interval is high-enough that the cheap
  // file-read poll costs nothing while idle.
  setTimeout(() => void runBridgeHeal(), 5_000)
  bridgeHealTimer = setInterval(() => void runBridgeHeal(), BRIDGE_HEAL_INTERVAL_MS)
}

function stopBridgeHealPoll() {
  if (bridgeHealTimer) {
    clearInterval(bridgeHealTimer)
    bridgeHealTimer = null
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
  ipcMain.handle('dsh-plugins:add', async (event, spec) => {
    assertManagerSender(event)
    const result = await api.add(spec)
    pushManagerSnapshot()
    return result
  })
  ipcMain.handle('dsh-plugins:remove', async (event, spec) => {
    assertManagerSender(event)
    const result = await api.remove(spec)
    pushManagerSnapshot()
    return result
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
  ipcMain.handle('dsh-plugins:update', async (event, name) => {
    assertManagerSender(event)
    const result = await api.update(name)
    pushManagerSnapshot()
    return result
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
  // The desktop shell hosts its own window, so the dsh web host must not also
  // open a system browser. --no-open is only understood from rc.8 onward.
  const currentVersion = selected && resolveDshEntrySource(selected, versionsDir) === 'user' ? selected : bundledDshVersion()
  const noOpen = supportsNoOpen(currentVersion)
  service = startDshService({
    electronExecutable: process.execPath,
    entry: currentDshEntry(),
    noOpen,
    port: versionState.dshPort ?? 3080,
    environment: {
      ...process.env,
      ...(userPath !== undefined ? { PATH: userPath } : {}),
      NODE_OPTIONS: '',
      DSH_DESKTOP: '1',
    },
  })
  return service
}

async function ensureDshPortAvailable() {
  const port = versionState.dshPort ?? 3080
  try {
    if (await checkPortAvailable(port)) return true
  } catch (error) {
    await dialog.showMessageBox({
      type: 'error',
      title: `${APP_NAME} 启动失败`,
      message: '无法检查 DSH 服务端口。',
      detail: error instanceof Error ? error.message : String(error),
    })
    return false
  }

  await showDshPortConflictDialog()
  return false
}

function isDshPortConflict(error) {
  const message = error instanceof Error ? error.message : String(error)
  return /EADDRINUSE|address already in use/i.test(message)
}

function showDshPortConflictDialog() {
  const port = versionState.dshPort ?? 3080
  return dialog.showMessageBox({
    type: 'error',
    title: `${APP_NAME} 启动失败`,
    message: `端口 ${port} 已被占用。`,
    detail:
      'DSH 需要使用此本地端口启动服务。请关闭其他 DSH 实例或占用该端口的程序，然后重新启动应用。',
  })
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
  if (stopPromise) return stopPromise
  const current = service
  if (!current) return Promise.resolve()
  stopPromise = new Promise((resolve) => {
    let timer
    let forceTimer
    const finish = () => {
      clearTimeout(timer)
      clearTimeout(forceTimer)
      if (service === current) service = undefined
      stopPromise = undefined
      resolve()
    }

    if (current.child.exitCode !== null) {
      finish()
      return
    }

    current.child.once('exit', finish)
    timer = setTimeout(() => {
      // The child ignored SIGTERM (hung thread, deadlock, ...): escalate to
      // SIGKILL so a stale dsh host can never hold the loopback port while a
      // replacement starts.
      try {
        current.child.kill('SIGKILL')
      } catch {
        // Already gone.
      }
      // Keep shutdown bounded even if the child process is unable to emit its
      // exit event. The OS will still release the port once SIGKILL takes
      // effect.
      forceTimer = setTimeout(finish, 1_000)
    }, 5_000)
    current.stop()
  })
  return stopPromise
}

async function quitAfterStoppingService(event) {
  if (isQuitting) {
    return
  }
  isQuitting = true
  event?.preventDefault()
  stopBridgeHealPoll()
  try {
    await stopHarnessService()
  } catch (error) {
    console.warn('error stopping harness service before quit:', error)
  }
  app.exit(0)
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
    if (isDshPortConflict(error)) {
      await showDshPortConflictDialog()
    } else {
      await dialog.showMessageBox({
        type: 'error',
        title: '重启 dsh 服务失败',
        message: 'DSH 服务重启失败。',
        detail: message,
      })
    }
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

let profileWatcher = null
function watchProfileChanges() {
  const profileDir = resolveWebProfileDir()
  try {
    if (!existsSync(profileDir)) mkdirSync(profileDir, { recursive: true })
    let debounceTimer = null
    const notifyChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        pushManagerSnapshot()
      }, 150)
    }
    profileWatcher = watch(profileDir, { recursive: false }, (_eventType, filename) => {
      if (!filename || filename === 'package.json' || String(filename).endsWith('.json')) {
        notifyChange()
      }
    })
    app.on('before-quit', () => {
      try {
        profileWatcher?.close()
      } catch {}
    })
  } catch {
    // Best-effort file watching
  }
}

async function launch() {
  watchProfileChanges()
  ipcMain.on('dsh-bridge:ready', () => {
    console.log('[dsh-bridge] web plugins activated')
  })
  ipcMain.on('dsh-bridge:theme', (_event, snapshot) => {
    const colorScheme = snapshot?.colorScheme
    const externalTheme = typeof snapshot?.externalTheme === 'string' ? snapshot.externalTheme : null
    if (currentExternalTheme !== externalTheme) {
      currentExternalTheme = externalTheme
      pushManagerSnapshot()
    }
    if (colorScheme === 'dark' || colorScheme === 'light') {
      if (currentColorScheme !== colorScheme) {
        console.log('[dsh-bridge] theme', colorScheme)
        syncManagerTheme(colorScheme)
      }
    }
    if (!mainWindow || mainWindow.isDestroyed()) return
    // On macOS the sidebar material handles the window background (the page is
    // translucent there); painting an opaque color would hide the vibrancy.
    if (process.platform === 'darwin') return
    if (colorScheme === 'dark' || colorScheme === 'light') {
      mainWindow.setBackgroundColor(colorScheme === 'dark' ? '#151517' : '#ffffff')
    }
  })
  ipcMain.on('dsh-bridge:locale', (_event, payload) => {
    const language = payload && payload.language === 'en' ? 'en' : 'zh'
    if (currentLanguage !== language) {
      console.log('[dsh-bridge] locale', language)
      currentLanguage = language
      createAppMenu()
      pushManagerSnapshot()
    }
  })
  ipcMain.on('dsh-bridge:notify', (_event, payload) => {
    // Only surface a system notification when the window is not focused (or
    // hidden) — if it is on screen and focused the running UI already shows
    // the result, so an extra notification would just be noise.
    if (mainWindowFocused && mainWindow && !mainWindow.isDestroyed()) return
    showTaskDoneNotification(payload)
  })
  ipcMain.on('dsh-bridge:debug', (_event, message) => {
    appendDiag(`[bridge] ${message}`)
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
  if (!(await ensureDshPortAvailable())) {
    app.quit()
    return
  }
  startHarnessService()
  watchServiceExit()

  try {
    serviceUrl = await service.ready
    await createWindow(serviceUrl)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isDshPortConflict(error)) {
      await showDshPortConflictDialog()
    } else {
      await dialog.showMessageBox({
        type: 'error',
        title: `${APP_NAME} 启动失败`,
        message: 'DSH 无法启动。',
        detail: message,
      })
    }
    app.quit()
    return
  }

  // Dev affordance: DSH_OPEN_MANAGER=1 opens the dsh manager window on launch
  // so the UI can be inspected without clicking through the Help menu.
  if (process.env.DSH_OPEN_MANAGER === '1') {
    setTimeout(() => openVersionManagerWindow(), 500)
  }
  void ensureDesktopHostPlugin()
  startBridgeHealPoll()
  // Ask for notification permission at a calm moment so the first real
  // "task done" notification (which may fire while the window is hidden) does
  // not surface a permission prompt mid-use.
  warmNotificationPermission()
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

  app.whenReady().then(() => {
    migrateLegacyBundleName()
    return launch()
  })
}

app.on('activate', () => {
  void showMainWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  void quitAfterStoppingService(event)
})
