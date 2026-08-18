// electron-updater wiring for the desktop shell: silent auto-check on launch,
// periodic re-checks, download progress, and a restart prompt once the update
// is downloaded. The shell itself is updated whole-app, which also replaces
// the bundled @deepseek-ai/dsh runtime.
import { app, dialog } from 'electron'
import electronUpdater from 'electron-updater'
import { installDownloadedUpdate } from './macos-install.js'
import {
  resolveAutoCheckIntervalMs,
  resolveUpdateFeed,
  shouldEnableAutoUpdate,
} from './updater-config.js'
import { canStartCheck, createUpdaterState, reduceUpdaterState } from './updater-state.js'

const CHECK_DELAY_MS = 5_000
const { autoUpdater } = electronUpdater

const autoUpdateEnabled = () => shouldEnableAutoUpdate(process.env, app.isPackaged)

export function initAutoUpdater({
  appName,
  getMainWindow = () => undefined,
  onBeforeInstall = () => {},
  intervalMs = resolveAutoCheckIntervalMs(),
} = {}) {
  const updater = createUpdaterState()

  const applyEvent = (event) => Object.assign(updater, reduceUpdaterState(updater, event))

  const checkForUpdates = async ({ manual = false } = {}) => {
    if (!autoUpdateEnabled()) return updater
    if (!canStartCheck(updater)) return updater
    applyEvent({ type: 'check', manual })
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      // The 'error' event already surfaced the failure.
    }
    return updater
  }

  if (!autoUpdateEnabled()) {
    return { ...updater, checkForUpdates }
  }

  const feed = resolveUpdateFeed()
  if (feed) autoUpdater.setFeedURL(feed)

  autoUpdater.autoDownload = true
  // On macOS the actual install is Squirrel.Mac, which refuses ad-hoc-signed
  // builds; installation happens through our own bundle swap on request.
  autoUpdater.autoInstallOnAppQuit = false

  const showMessage = async (options) => {
    try {
      return await dialog.showMessageBox(getMainWindow(), options)
    } catch {
      return { response: 0 }
    }
  }

  autoUpdater.on('checking-for-update', () => {
    applyEvent({ type: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    applyEvent({ type: 'available', info })
    void showMessage({
      type: 'info',
      title: '发现新版本',
      message: `${appName} 有新版本 ${info.version}`,
      detail: '正在后台下载，完成后会提示你重启安装。',
      buttons: ['知道了'],
    })
  })

  autoUpdater.on('update-not-available', () => {
    applyEvent({ type: 'not-available' })
    if (updater.manual) {
      void showMessage({
        type: 'info',
        title: '没有新版本',
        message: '当前已是最新版本。',
        buttons: ['好'],
      })
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    applyEvent({ type: 'downloaded', info })
    void showMessage({
      type: 'info',
      title: '更新已就绪',
      message: `新版本 ${info.version} 已下载完成。`,
      detail: '重启应用即可完成更新。',
      buttons: ['稍后', '立即重启'],
      defaultId: 1,
      cancelId: 0,
    })
      .then(({ response }) => {
        if (response === 1) {
          applyEvent({ type: 'install' })
          onBeforeInstall()
          if (process.platform === 'darwin') {
            void installDownloadedUpdate()
              .then(() => {
                app.quit()
              })
              .catch((error) => {
                console.warn('self-install failed:', error)
                applyEvent({ type: 'error', error })
                void showMessage({
                  type: 'error',
                  title: '更新安装失败',
                  message: '无法自动安装更新。',
                  detail: '请到 GitHub Releases 页面手动下载新版本安装。',
                  buttons: ['好'],
                })
              })
          } else {
            try {
              autoUpdater.quitAndInstall(false, true)
            } catch (error) {
              console.warn('quitAndInstall failed:', error)
              applyEvent({ type: 'error', error })
              void showMessage({
                type: 'error',
                title: '更新安装失败',
                message: '无法自动安装更新。',
                detail: '请到 GitHub Releases 页面手动下载新版本安装。',
                buttons: ['好'],
              })
            }
          }
        } else {
          // The user postponed the restart ("稍后"): reset to idle so the
          // periodic checks keep running and a newer update can still be
          // offered later in the same session.
          applyEvent({ type: 'defer' })
        }
      })
      .catch(() => {
        // The dialog was closed before a choice was made; same as "稍后".
        applyEvent({ type: 'defer' })
      })
  })

  autoUpdater.on('error', (error) => {
    applyEvent({ type: 'error', error })
    if (updater.manual) {
      void showMessage({
        type: 'error',
        title: '检查更新失败',
        message: '无法检查更新。',
        detail: String(error?.message ?? error),
        buttons: ['好'],
      })
    } else {
      console.warn('auto-update check failed:', error)
    }
  })

  setTimeout(() => {
    void checkForUpdates({ manual: false })
  }, CHECK_DELAY_MS)
  setInterval(() => {
    void checkForUpdates({ manual: false })
  }, intervalMs)

  return { ...updater, checkForUpdates }
}
