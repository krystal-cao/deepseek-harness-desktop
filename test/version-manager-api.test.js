import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createVersionManagerApi } from '../src/version-manager-api.js'

function makeApi(overrides = {}) {
  const calls = { install: 0, refresh: 0, restart: 0, stateChanged: 0 }
  const state = { selectedVersion: null, autoFollowLatest: true, npmRegistry: null, uiTheme: 'default' }
  const busyState = { installing: false, installingVersion: null }
  let catalog = { latest: '0.1.0-rc.8', versions: [{ version: '0.1.0-rc.8' }] }
  const defaultSnapshot = () => ({
    selectedVersion: state.selectedVersion,
    autoFollowLatest: state.autoFollowLatest,
    npmRegistry: state.npmRegistry,
    uiTheme: state.uiTheme,
  })
  const api = createVersionManagerApi({
    busyState,
    snapshot: defaultSnapshot,
    currentNpmRegistry: () => 'https://registry.npmmirror.com/',
    readCatalog: () => catalog,
    refreshCatalog: async () => {
      calls.refresh += 1
      catalog = { latest: '0.1.0-rc.8', versions: [{ version: '0.1.0-rc.8' }] }
    },
    updateState: (mutate) => {
      mutate(state)
    },
    installDshVersion: async ({ version }) => {
      calls.install += 1
      assert.ok(version)
    },
    versionsDir: '/tmp/vm-test',
    buildInstallEnv: () => ({}),
    onProgress: () => {},
    onStateChange: () => {
      calls.stateChanged += 1
    },
    installedVersionList: () => [{ version: '0.1.0-rc.7', source: 'installed' }],
    restartDshService: async () => {
      calls.restart += 1
    },
    ...overrides,
  })
  return { api, calls, state, busyState, setCatalog: (next) => { catalog = next } }
}

test('installing reflects the shared busy state', () => {
  const { api, busyState } = makeApi()
  assert.equal(api.installing, false)
  busyState.installing = true
  assert.equal(api.installing, true)
})

test('install rejects while another install is in flight', async () => {
  const { api, busyState } = makeApi()
  busyState.installing = true
  await assert.rejects(() => api.install('0.1.0-rc.8'), /已有 DSH 版本正在安装/)
})

test('install rejects non-string versions', async () => {
  const { api } = makeApi()
  await assert.rejects(() => api.install(42), /无效的版本号/)
})

test('install refreshes an empty catalog before installing', async () => {
  const { api, calls, setCatalog } = makeApi()
  setCatalog({ latest: null, versions: [] })
  const result = await api.install('0.1.0-rc.8')
  assert.equal(calls.refresh, 1)
  assert.equal(calls.install, 1)
  // Installing the first version selects it automatically.
  assert.equal(result.selectedVersion, '0.1.0-rc.8')
})

test('install clears busy state in finally', async () => {
  const { api, busyState } = makeApi({
    installDshVersion: async () => {
      throw new Error('boom')
    },
  })
  await assert.rejects(() => api.install('0.1.0-rc.8'), /boom/)
  assert.equal(busyState.installing, false)
  assert.equal(busyState.installingVersion, null)
})

test('select rejects versions that are not installed', async () => {
  const { api } = makeApi()
  await assert.rejects(() => api.select('0.0.1'), /该版本尚未安装/)
})

test('select switches the version and restarts the service', async () => {
  const { api, calls, state } = makeApi()
  const result = await api.select('0.1.0-rc.7')
  assert.equal(state.selectedVersion, '0.1.0-rc.7')
  assert.equal(calls.restart, 1)
  assert.equal(result.selectedVersion, '0.1.0-rc.7')
})

test('uninstall rejects the currently selected version', async () => {
  const { api, state } = makeApi()
  state.selectedVersion = '0.1.0-rc.7'
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vm-uninst-'))
  mkdirSync(path.join(dir, '0.1.0-rc.7'), { recursive: true })
  try {
    const api2 = createVersionManagerApi({
      busyState: { installing: false, installingVersion: null },
      snapshot: () => ({ selectedVersion: '0.1.0-rc.7' }),
      currentNpmRegistry: () => '',
      readCatalog: () => ({ versions: [] }),
      refreshCatalog: async () => {},
      updateState: () => {},
      installDshVersion: async () => {},
      versionsDir: dir,
      buildInstallEnv: () => ({}),
      onProgress: () => {},
      onStateChange: () => {},
      installedVersionList: () => [],
      restartDshService: async () => {},
    })
    await assert.rejects(async () => api2.uninstall('0.1.0-rc.7'), /请先切换到其他版本/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('uninstall refuses to escape the versions directory', async () => {
  const { api } = makeApi()
  await assert.rejects(async () => api.uninstall('../../etc'), /无效的版本号/)
})

test('uninstall removes an installed non-selected version directory', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vm-uninst-'))
  mkdirSync(path.join(dir, '0.1.0-rc.7'), { recursive: true })
  writeFileSync(path.join(dir, '0.1.0-rc.7', 'marker'), 'x')
  try {
    const api = createVersionManagerApi({
      busyState: { installing: false, installingVersion: null },
      snapshot: () => ({ selectedVersion: '0.1.0-rc.8' }),
      currentNpmRegistry: () => '',
      readCatalog: () => ({ versions: [] }),
      refreshCatalog: async () => {},
      updateState: () => {},
      installDshVersion: async () => {},
      versionsDir: dir,
      buildInstallEnv: () => ({}),
      onProgress: () => {},
      onStateChange: () => {},
      installedVersionList: () => [],
      restartDshService: async () => {},
    })
    await api.uninstall('0.1.0-rc.7')
    assert.equal(await (await import('node:fs')).existsSync(path.join(dir, '0.1.0-rc.7')), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('setAutoFollow requires a boolean', async () => {
  const { api } = makeApi()
  await assert.rejects(async () => api.setAutoFollow('yes'), /无效的自动跟随设置/)
})

test('setAutoFollow persists the value', async () => {
  const { api, state } = makeApi()
  await api.setAutoFollow(false)
  assert.equal(state.autoFollowLatest, false)
})

test('setNpmRegistry clears the override with null', async () => {
  const { api, state } = makeApi()
  await api.setNpmRegistry(null)
  assert.equal(state.npmRegistry, null)
})

test('setNpmRegistry normalizes a valid URL', async () => {
  const { api, state } = makeApi()
  await api.setNpmRegistry('https://registry.npmjs.org/')
  assert.equal(state.npmRegistry, 'https://registry.npmjs.org/')
})

test('setUiTheme accepts the supported themes', async () => {
  const { api, state } = makeApi()
  await api.setUiTheme('claude')
  assert.equal(state.uiTheme, 'claude')
  await api.setUiTheme('default')
  assert.equal(state.uiTheme, 'default')
})

test('setUiTheme rejects unknown values', async () => {
  const { api } = makeApi()
  await assert.rejects(async () => api.setUiTheme('midnight'), /无效的界面主题/)
})

test('setUiTheme rejects switching when an external theme is active', async () => {
  const { api, state } = makeApi({
    snapshot: () => ({
      selectedVersion: null,
      autoFollowLatest: true,
      npmRegistry: null,
      uiTheme: state.uiTheme,
      externalTheme: 'dsh-theme-ti',
    }),
  })
  await assert.rejects(async () => api.setUiTheme('claude'), /检测到正在使用第三方主题（dsh-theme-ti）/)
  // Resetting to default is permitted
  await api.setUiTheme('default')
  assert.equal(state.uiTheme, 'default')
})

