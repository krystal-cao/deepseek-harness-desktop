const api = window.dshVersions

const installedEl = document.getElementById('installed')
const availableEl = document.getElementById('available')
const statusEl = document.getElementById('status')
const refreshButton = document.getElementById('refresh')

let snapshot = null
let busy = false
let confirmingVersion = null

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

function render() {
  if (!snapshot) return
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
        meta: item.source === 'bundled' ? '应用内置版本' : '已安装到本地',
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

async function refresh() {
  busy = true
  confirmingVersion = null
  refreshButton.disabled = true
  setStatus('正在刷新…')
  try {
    snapshot = await api.refresh()
    setStatus('')
  } catch (error) {
    setStatus(error?.message ?? '刷新失败', true)
  } finally {
    busy = false
    refreshButton.disabled = false
    render()
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

refreshButton.addEventListener('click', () => void refresh())
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
