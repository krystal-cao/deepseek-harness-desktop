// electron-updater wiring for the desktop shell: silent auto-check on launch,
// periodic re-checks, tray-tooltip download progress, and a restart prompt once
// the update is downloaded. The shell itself is updated whole-app, which also
// replaces the bundled @deepseek-ai/dsh runtime.
import { app, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import {
  formatReleaseNotes,
  resolveAutoCheckIntervalMs,
  resolveUpdateFeed,
  shouldEnableAutoUpdate,
} from './updater-config.js'

const CHECK_DELAY_MS = 5_000

const autoUpdateEnabled = () => shouldEnableAutoUpdate(process.env, app.isPackaged)

export function initAutoUpdater({
  appName,
  getMainWindow = () => undefined,
  onBeforeInstall = () => {},
  setTrayTooltip = () => {},
  intervalMs = resolveAutoCheckIntervalMs(),
} = {}) {
  const updater = {
    state: 'idle', // idle | checking | downloading | downloaded | installing | error
    lastError: null,
    info: null,
    manual: false,
  }

  const updateState = (partial) => Object.assign(updater, partial)

  const checkForUpdates = async ({ manual = false } = {}) => {
    if (!autoUpdateEnabled()) return updater
    if (['checking', 'downloading', 'downloaded', 'installing'].includes(updater.state)) {
      return updater
    }
    updater.manual = manual
    updateState({ state: 'checking', lastError: null })
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
  autoUpdater.autoInstallOnAppQuit = true

  const showMessage = async (options) => {
    try {
      return await dialog.showMessageBox(getMainWindow(), options)
    } catch {
      return { response: 0 }
    }
  }

  autoUpdater.on('checking-for-update', () => {
    updateState({ state: 'checking', lastError: null })
  })

  autoUpdater.on('update-available', (info) => {
    updateState({ state: 'downloading', info })
    setTrayTooltip(`${appName} 更新 ${info.version} 下载中…`)
    const notes = formatReleaseNotes(info)
    void showMessage({
      type: 'info',
      title: '发现新版本',
      message: `${appName} 有新版本 ${info.version}`,
      detail: notes ? `更新内容：\n${notes}` : '正在后台下载，完成后会提示你重启安装。',
      buttons: ['知道了'],
    })
  })

  autoUpdater.on('update-not-available', () => {
    updateState({ state: 'idle' })
    if (updater.manual) {
      void showMessage({
        type: 'info',
        title: '没有新版本',
        message: '当前已是最新版本。',
        buttons: ['好'],
      })
    }
  })

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.min(100, Math.round(progress.percent))
    setTrayTooltip(`正在下载 ${appName} 更新：${percent}%`)
  })

  autoUpdater.on('update-downloaded', (info) => {
    updateState({ state: 'downloaded', info })
    setTrayTooltip(`${appName} 更新已就绪`)
    void showMessage({
      type: 'info',
      title: '更新已就绪',
      message: `新版本 ${info.version} 已下载完成。`,
      detail: '重启应用即可完成更新。',
      buttons: ['稍后', '立即重启'],
      defaultId: 1,
      cancelId: 0,
    }).then(({ response }) => {
      if (response === 1) {
        updateState({ state: 'installing' })
        onBeforeInstall()
        autoUpdater.quitAndInstall(false, true)
      }
    })
  })

  autoUpdater.on('error', (error) => {
    updateState({ state: 'error', lastError: error })
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
