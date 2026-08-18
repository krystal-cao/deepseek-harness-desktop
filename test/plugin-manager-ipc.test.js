import assert from 'node:assert/strict'
import test from 'node:test'
import { createPluginManagerApi } from '../src/plugin-manager-ipc.js'

function makeApi(overrides = {}) {
  const calls = { list: 0, add: 0, remove: 0, update: 0, restart: 0 }
  const api = createPluginManagerApi({
    listPlugins: async () => {
      calls.list += 1
      return { plugins: [{ name: 'dshmarket', version: '1.8.0' }] }
    },
    mutatePlugin: {
      add: async (spec) => {
        calls.add += 1
        return { code: 0, stdout: '', stderr: '' }
      },
      remove: async (spec) => {
        calls.remove += 1
        return { code: 0, stdout: '', stderr: '' }
      },
      update: async (spec) => {
        calls.update += 1
        return { code: 0, stdout: '', stderr: '' }
      },
    },
    restartService: async () => {
      calls.restart += 1
    },
    ...overrides,
  })
  return { api, calls }
}

test('list returns the plugin list from the underlying CLI', async () => {
  const { api, calls } = makeApi()
  const result = await api.list()
  assert.deepEqual(result.plugins, [{ name: 'dshmarket', version: '1.8.0' }])
  assert.equal(result.error, undefined)
  assert.equal(calls.list, 1)
})

test('list maps CLI failures into an error payload', async () => {
  const { api } = makeApi({
    listPlugins: async () => {
      throw new Error('读取插件列表失败：boom')
    },
  })
  const result = await api.list()
  assert.deepEqual(result.plugins, [])
  assert.match(result.error, /boom/)
})

test('add validates the spec before touching the CLI', async () => {
  const { api, calls } = makeApi()
  await assert.rejects(() => api.add('-rf /'), /无效的插件名/)
  assert.equal(calls.add, 0)
  assert.equal(calls.restart, 0)
})

test('add runs the mutation, restarts the service and refreshes the list', async () => {
  const { api, calls } = makeApi()
  const result = await api.add('dshmarket')
  assert.equal(calls.add, 1)
  assert.equal(calls.restart, 1)
  assert.equal(calls.list, 1)
  assert.deepEqual(result.plugins, [{ name: 'dshmarket', version: '1.8.0' }])
})

test('add rejects non-zero exits without restarting', async () => {
  const { api, calls } = makeApi({
    mutatePlugin: {
      add: async () => ({ code: 1, stdout: '', stderr: 'Ignored build scripts: esbuild' }),
      remove: async () => ({ code: 0, stdout: '', stderr: '' }),
    },
  })
  await assert.rejects(() => api.add('esbuild'), /Ignored build scripts/)
  assert.equal(calls.restart, 0)
})

test('update validates the name and runs the update mutation', async () => {
  let seen = null
  const api = createPluginManagerApi({
    listPlugins: async () => ({ plugins: [] }),
    mutatePlugin: {
      add: async () => ({ code: 0, stdout: '', stderr: '' }),
      update: async (spec) => {
        seen = spec
        return { code: 0, stdout: '', stderr: '' }
      },
      remove: async () => ({ code: 0, stdout: '', stderr: '' }),
    },
    restartService: async () => {},
  })
  await api.update('dshmarket')
  assert.equal(seen, 'dshmarket')
})

test('update rejects invalid names without touching the CLI', async () => {
  const { api, calls } = makeApi()
  await assert.rejects(() => api.update('-rf /'), /无效的插件名/)
  assert.equal(calls.add, 0)
  assert.equal(calls.restart, 0)
})

test('update rejects GitHub-source plugins explicitly', async () => {
  const { api, calls } = makeApi()
  await assert.rejects(() => api.update('github:owner/repo'), /GitHub 源插件不支持自动更新/)
  assert.equal(calls.add, 0)
  assert.equal(calls.restart, 0)
})

test('concurrent mutations are rejected while one is in flight', async () => {
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const { api } = makeApi({
    mutatePlugin: {
      add: async () => {
        await gate
        return { code: 0, stdout: '', stderr: '' }
      },
      remove: async () => ({ code: 0, stdout: '', stderr: '' }),
    },
  })
  const first = api.add('dshmarket')
  await assert.rejects(() => api.remove('other'), /已有插件操作进行中/)
  release()
  const result = await first
  assert.deepEqual(result.plugins, [{ name: 'dshmarket', version: '1.8.0' }])
})

test('busy resets after a successful mutation', async () => {
  const { api } = makeApi()
  await api.add('dshmarket')
  assert.equal(api.busy, false)
  const result = await api.remove('dshmarket')
  assert.deepEqual(result.plugins, [{ name: 'dshmarket', version: '1.8.0' }])
})
