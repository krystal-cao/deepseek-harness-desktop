// Pure controller for the dsh version-manager IPC surface, kept free of
// Electron imports so the handler logic (busy guard, input validation,
// state changes) can be unit-tested with plain node --test.
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { DSH_ANY_VERSION_PATTERN, normalizeNpmRegistry } from './updater-config.js'

export function createVersionManagerApi({
  busyState,
  snapshot,
  currentNpmRegistry,
  readCatalog,
  refreshCatalog,
  updateState,
  installDshVersion,
  versionsDir,
  buildInstallEnv,
  onProgress,
  onStateChange,
  installedVersionList,
  restartDshService,
}) {
  const loadCatalogVersions = () => {
    const catalog = readCatalog()
    return Array.isArray(catalog?.versions) ? catalog.versions.map((item) => item.version) : []
  }

  return {
    get installing() {
      return busyState.installing
    },

    snapshot: () => snapshot(),

    refresh: async () => {
      await refreshCatalog()
      return snapshot()
    },

    install: async (version) => {
      if (busyState.installing) throw new Error('已有 DSH 版本正在安装')
      if (typeof version !== 'string') throw new Error('无效的版本号')
      busyState.installing = true
      busyState.installingVersion = version
      onStateChange()
      try {
        if (loadCatalogVersions().length === 0) await refreshCatalog()
        await installDshVersion({
          versionsDir,
          version,
          availableVersions: loadCatalogVersions(),
          registry: currentNpmRegistry(),
          env: buildInstallEnv(),
          onProgress,
        })
        const current = snapshot()
        if (!current.selectedVersion) {
          updateState((state) => {
            state.selectedVersion = version
          })
        }
      } finally {
        busyState.installing = false
        busyState.installingVersion = null
      }
      onStateChange()
      return snapshot()
    },

    select: async (version) => {
      if (typeof version !== 'string') throw new Error('无效的版本号')
      if (!installedVersionList().some((item) => item.version === version)) {
        throw new Error('该版本尚未安装')
      }
      updateState((state) => {
        state.selectedVersion = version
      })
      await restartDshService()
      return snapshot()
    },

    uninstall: (version) => {
      if (typeof version !== 'string' || !DSH_ANY_VERSION_PATTERN.test(version)) {
        throw new Error('无效的版本号')
      }
      if (version === snapshot().selectedVersion) {
        throw new Error('请先切换到其他版本，再卸载当前版本')
      }
      const target = path.join(versionsDir, version)
      if (path.dirname(target) !== versionsDir || !existsSync(target)) {
        throw new Error('该版本未安装')
      }
      rmSync(target, { recursive: true, force: true })
      return snapshot()
    },

    setAutoFollow: (value) => {
      if (typeof value !== 'boolean') throw new Error('无效的自动跟随设置')
      updateState((state) => {
        state.autoFollowLatest = value
      })
      return snapshot()
    },

    setNpmRegistry: (value) => {
      updateState((state) => {
        state.npmRegistry = normalizeNpmRegistry(value)
      })
      return snapshot()
    },

    setDshPort: (value) => {
      if (value !== null && (typeof value !== 'number' || !Number.isInteger(value) || value < 1024 || value > 65535)) {
        throw new Error('无效的端口号')
      }
      updateState((state) => {
        state.dshPort = value
      })
      return snapshot()
    },
  }
}
