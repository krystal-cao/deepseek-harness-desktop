// Pure controller for the plugin-management IPC surface, kept free of Electron
// so the busy guard, spec validation and restart behavior can be unit-tested.
import { validatePluginSpec } from './dsh-plugins.js'

export function createPluginManagerApi({ listPlugins, mutatePlugin, restartService }) {
  let busy = false

  const runMutation = async (spec, action) => {
    if (busy) throw new Error('已有插件操作进行中')
    if (!validatePluginSpec(spec)) throw new Error('无效的插件名')
    busy = true
    try {
      const result = await action(spec)
      if (result.code !== 0) {
        throw new Error(`${result.stderr || result.stdout}`.trim().slice(-800))
      }
      await restartService()
      return listPlugins()
    } finally {
      busy = false
    }
  }

  return {
    get busy() {
      return busy
    },
    list: async () => {
      if (busy) return { plugins: [], raw: '', error: '插件操作进行中，请稍候' }
      try {
        return await listPlugins()
      } catch (error) {
        return { plugins: [], raw: '', error: error instanceof Error ? error.message : '读取插件列表失败' }
      }
    },
    add: (spec) => runMutation(spec, mutatePlugin.add),
    remove: (spec) => runMutation(spec, mutatePlugin.remove),
  }
}
