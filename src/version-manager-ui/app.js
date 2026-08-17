const api = window.dshVersions
const pluginsApi = window.dshPlugins

const installedEl = document.getElementById('installed')
const availableEl = document.getElementById('available')
const pluginsEl = document.getElementById('plugins')
const statusEl = document.getElementById('status')
const refreshButton = document.getElementById('refresh')
const autoFollowEl = document.getElementById('auto-follow')
const registryInputEl = document.getElementById('registry-input')
const registrySaveEl = document.getElementById('registry-save')
const registryResetEl = document.getElementById('registry-reset')
const pluginForm = document.getElementById('plugin-form')
const pluginSpecEl = document.getElementById('plugin-spec')
const tabVersionsEl = document.getElementById('tab-versions')
const tabPluginsEl = document.getElementById('tab-plugins')
const panelVersionsEl = document.getElementById('panel-versions')
const panelPluginsEl = document.getElementById('panel-plugins')

let snapshot = null
let busy = false
let confirmingVersion = null
let confirmingPlugin = null
let pluginsState = { plugins: [], error: null }
let activeTab = 'versions'

function setStatus(message, isError = false) {
  statusEl.textContent = message
  statusEl.hidden = !message
  statusEl.classList.toggle('error', isError)
}

function versionRow(version, { meta, actions = [] }) {
  const li = document.createElement('li')
  li.className = 'version'

  const name = document.createElement('span')
  name.className = 'name'
  name.textContent = version

  const metaEl = document.createElement('span')
  metaEl.className = 'meta'
  metaEl.textContent = meta

  li.append(name, metaEl)
  for (const action of actions) {
    if (action.tag) {
      const tag = document.createElement('span')
      tag.className = `tag ${action.tagClass ?? ''}`
      tag.textContent = action.tag
      li.append(tag)
      continue
    }
    const button = document.createElement('button')
    button.type = 'button'
    button.className = action.primary ? 'primary' : ''
    if (action.danger) button.classList.add('danger')
    button.textContent = action.label
    button.disabled = action.disabled ?? false
    button.addEventListener('click', action.onClick)
    li.append(button)
  }
  return li
}

function familyMeta(family = []) {
  const total = family.length
  const aligned = family.filter((item) => item.aligned).length
  if (total === 0) return ''
  if (aligned === total) return `插件族 ${total}/${total} 对齐`
  const missing = family
    .filter((item) => !item.aligned)
    .slice(0, 3)
    .map((item) => item.name.replace('@deepseek-ai/', ''))
  const suffix = total - aligned > 3 ? '…' : ''
  return `插件族 ${aligned}/${total} 对齐（缺 ${missing.join(', ')}${suffix}）`
}

function render() {
  if (!snapshot) return
  autoFollowEl.checked = snapshot.autoFollowLatest ?? true
  registryInputEl.value = snapshot.npmRegistry ?? ''
  installedEl.replaceChildren()
  availableEl.replaceChildren()

  const installed = snapshot.installedVersions ?? []
  if (installed.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'empty'
    empty.textContent = '暂无已安装版本（应用内置版本可用）。'
    installedEl.append(empty)
  } else {
    for (const item of installed) {
      const isCurrent = snapshot.selectedVersion === item.version
      const metaParts = [item.source === 'bundled' ? '应用内置版本' : '已安装到本地']
      if (item.family) metaParts.push(familyMeta(item.family))
      const actions = []
      if (isCurrent) {
        actions.push({ tag: '当前使用', tagClass: 'current' })
      } else {
        actions.push(
          {
            label: '切换',
            primary: true,
            disabled: busy,
            onClick: () => selectVersion(item.version),
          },
          ...(item.source === 'installed'
            ? [{
                label: confirmingVersion === item.version ? '确认卸载' : '卸载',
                danger: true,
                disabled: busy,
                onClick: () => {
                  if (confirmingVersion === item.version) void uninstallVersion(item.version)
                  else {
                    confirmingVersion = item.version
                    render()
                  }
                },
              }]
            : []),
        )
      }
      installedEl.append(versionRow(item.version, {
        meta: metaParts.join(' · '),
        actions,
      }))
    }
  }

  const available = snapshot.availableVersions ?? []
  if (available.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'empty'
    empty.textContent = snapshot.error
      ? `无法获取官方版本列表：${snapshot.error}`
      : '官方版本列表为空。'
    availableEl.append(empty)
  } else {
    for (const item of available) {
      const isInstalled = installed.some((entry) => entry.version === item.version)
      const isCurrent = snapshot.selectedVersion === item.version
      const date = item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('zh-CN') : ''
      const actions = []
      if (isCurrent) {
        actions.push({ tag: '当前使用', tagClass: 'current' })
      } else if (isInstalled) {
        actions.push({
          label: '切换',
          primary: true,
          disabled: busy,
          onClick: () => selectVersion(item.version),
        })
      } else {
        actions.push({
          label: '安装',
          disabled: busy,
          onClick: () => installVersion(item.version),
        })
      }
      availableEl.append(versionRow(item.version, {
        meta: date ? `发布于 ${date}` : '',
        actions,
      }))
    }
  }
}

function renderPlugins() {
  pluginsEl.replaceChildren()
  if (pluginsState.error) {
    const li = document.createElement('li')
    li.className = 'empty'
    li.textContent = pluginsState.error
    pluginsEl.append(li)
    return
  }
  if (pluginsState.plugins.length === 0) {
    const li = document.createElement('li')
    li.className = 'empty'
    li.textContent = 'web profile 尚未安装第三方插件（内置 base / web-app 不在此列表）。'
    pluginsEl.append(li)
    return
  }
  for (const item of pluginsState.plugins) {
    const li = document.createElement('li')
    li.className = 'version'

    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = item.name

    const meta = document.createElement('span')
    meta.className = 'meta'
    meta.textContent = item.version ? `v${item.version}` : ''

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'danger'
    remove.textContent = confirmingPlugin === item.name ? '确认卸载' : '卸载'
    remove.disabled = busy
    remove.addEventListener('click', () => {
      if (confirmingPlugin === item.name) void removePluginByName(item.name)
      else {
        confirmingPlugin = item.name
        renderPlugins()
      }
    })

    li.append(name, meta, remove)
    pluginsEl.append(li)
  }
}

async function refresh() {
  busy = true
  confirmingVersion = null
  confirmingPlugin = null
  refreshButton.disabled = true
  try {
    if (activeTab === 'plugins') {
      setStatus('正在读取插件列表…')
      pluginsState = await pluginsApi.list()
      setStatus('')
    } else {
      setStatus('正在刷新…')
      snapshot = await api.refresh()
      setStatus('')
    }
  } catch (error) {
    setStatus(error?.message ?? '刷新失败', true)
  } finally {
    busy = false
    refreshButton.disabled = false
    // Render only after busy is reset, otherwise action buttons stay disabled
    // until the next interaction triggers a re-render.
    if (activeTab === 'plugins') renderPlugins()
    else render()
  }
}

async function saveRegistry(value) {
  try {
    snapshot = await api.setNpmRegistry(value)
    setStatus('镜像地址已保存，正在用新镜像刷新版本目录…')
    await refresh()
  } catch (error) {
    setStatus(error?.message ?? '保存镜像地址失败', true)
    registryInputEl.value = snapshot?.npmRegistry ?? ''
  }
}

async function installVersion(version) {
  busy = true
  confirmingVersion = null
  setStatus(`正在安装 DSH ${version}…`)
  try {
    snapshot = await api.install(version)
    setStatus('')
  } catch (error) {
    setStatus(error?.message ?? `安装 ${version} 失败`, true)
  } finally {
    busy = false
    render()
  }
}

async function selectVersion(version) {
  busy = true
  confirmingVersion = null
  setStatus(`正在切换到 DSH ${version}…`)
  try {
    snapshot = await api.select(version)
    setStatus('')
  } catch (error) {
    setStatus(error?.message ?? `切换 ${version} 失败`, true)
  } finally {
    busy = false
    render()
  }
}

async function uninstallVersion(version) {
  busy = true
  confirmingVersion = null
  setStatus(`正在卸载 DSH ${version}…`)
  try {
    snapshot = await api.uninstall(version)
    setStatus('')
  } catch (error) {
    setStatus(error?.message ?? `卸载 ${version} 失败`, true)
  } finally {
    busy = false
    render()
  }
}

async function installPluginSpec(spec) {
  busy = true
  confirmingPlugin = null
  setStatus(`正在安装插件 ${spec}…`)
  try {
    const result = await pluginsApi.add(spec)
    if (result?.error) throw new Error(result.error)
    pluginsState = result
    pluginSpecEl.value = ''
    setStatus(`插件 ${spec} 已安装，dsh 服务已重启。`)
  } catch (error) {
    setStatus(error?.message ?? `安装 ${spec} 失败`, true)
  } finally {
    busy = false
    renderPlugins()
  }
}

async function removePluginByName(spec) {
  busy = true
  confirmingPlugin = null
  setStatus(`正在卸载插件 ${spec}…`)
  try {
    const result = await pluginsApi.remove(spec)
    if (result?.error) throw new Error(result.error)
    pluginsState = result
    setStatus(`插件 ${spec} 已卸载，dsh 服务已重启。`)
  } catch (error) {
    setStatus(error?.message ?? `卸载 ${spec} 失败`, true)
  } finally {
    busy = false
    renderPlugins()
  }
}

function setActiveTab(tab) {
  activeTab = tab
  tabVersionsEl.classList.toggle('active', tab === 'versions')
  tabPluginsEl.classList.toggle('active', tab === 'plugins')
  panelVersionsEl.hidden = tab !== 'versions'
  panelPluginsEl.hidden = tab !== 'plugins'
  setStatus('')
}

refreshButton.addEventListener('click', () => void refresh())
tabVersionsEl.addEventListener('click', () => setActiveTab('versions'))
tabPluginsEl.addEventListener('click', () => {
  setActiveTab('plugins')
  void refresh()
})
pluginForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const spec = pluginSpecEl.value.trim()
  if (!spec || busy) return
  void installPluginSpec(spec)
})
autoFollowEl.addEventListener('change', async () => {
  try {
    snapshot = await api.setAutoFollow(autoFollowEl.checked)
    setStatus(autoFollowEl.checked ? '已开启自动跟随最新 RC。' : '已关闭自动跟随最新 RC。')
  } catch (error) {
    setStatus(error?.message ?? '保存自动跟随设置失败', true)
    autoFollowEl.checked = snapshot?.autoFollowLatest ?? true
  }
})
registrySaveEl.addEventListener('click', () => {
  const value = registryInputEl.value.trim()
  void saveRegistry(value === '' ? null : value)
})
registryResetEl.addEventListener('click', () => {
  registryInputEl.value = ''
  void saveRegistry(null)
})
api.onProgress((progress) => {
  if (progress?.message) setStatus(progress.message, progress.phase === 'failed')
})
api.onSnapshot((next) => {
  snapshot = next
  render()
})

api.getSnapshot()
  .then((next) => {
    snapshot = next
    render()
    if (!next.latestVersion && !next.availableVersions?.length) {
      return refresh()
    }
    return undefined
  })
  .catch((error) => setStatus(error?.message ?? '无法读取版本信息', true))
