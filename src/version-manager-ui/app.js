const api = window.dshVersions
const pluginsApi = window.dshPlugins

const titleEl = document.getElementById('page-title')
const subtitleEl = document.getElementById('page-subtitle')
const refreshButton = document.getElementById('refresh')
const statusEl = document.getElementById('status')
const sidebarVersionEl = document.getElementById('sidebar-version')
const autoFollowEl = document.getElementById('auto-follow')
const autoFollowTitleEl = document.getElementById('auto-follow-title')
const registryInputEl = document.getElementById('registry-input')
const registrySaveEl = document.getElementById('registry-save')
const registryResetEl = document.getElementById('registry-reset')
const registryComboEl = document.getElementById('registry-combo')
const registryToggleEl = document.getElementById('registry-toggle')
const registryMenuEl = document.getElementById('registry-menu')
const installedEl = document.getElementById('installed')
const availableEl = document.getElementById('available')
const pluginForm = document.getElementById('plugin-form')
const pluginSpecEl = document.getElementById('plugin-spec')
const pluginInstallButton = document.getElementById('plugin-install-button')
const pluginCountEl = document.getElementById('plugin-count')
const pluginsEl = document.getElementById('plugins')
const checkUpdatesButton = document.getElementById('check-updates')
const updateAllButton = document.getElementById('update-all')
const navButtons = [...document.querySelectorAll('.nav-item')]
const panels = {
  versions: document.getElementById('panel-versions'),
  plugins: document.getElementById('panel-plugins'),
}

const PAGE_META = {
  versions: { title: '版本管理', subtitle: '管理 dsh 的版本与镜像源' },
  plugins: { title: '插件管理', subtitle: '发现并管理 dsh 插件' },
}

let snapshot = null
let busy = false
let confirmingVersion = null
let confirmingPlugin = null
let pluginsState = { plugins: [], error: null }
let checkingUpdates = false
let updatingPlugin = null
let updatingAll = false
let activePanel = 'versions'
let localInstallingVersion = null
let localUninstallingVersion = null
let localUninstallingPlugin = null
const VISIBLE_VERSION_LIMIT = 5
let showAllVersions = false

function activeInstall() {
  return snapshot?.installingVersion ?? localInstallingVersion
}

/** Re-fetch the plugin list with a bounded timeout; fall back on failure. */
async function refetchPluginList(fallback) {
  try {
    return await Promise.race([
      pluginsApi.list(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('刷新插件列表超时')), 10_000)),
    ])
  } catch {
    return fallback
  }
}

function setStatus(message, isError = false) {
  statusEl.textContent = message
  statusEl.hidden = !message
  statusEl.classList.toggle('error', isError)
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function badge(text, cls) {
  return el('span', `badge ${cls}`, text)
}

function button(label, { cls = '', primary = false, danger = false, disabled = false, onClick } = {}) {
  const node = el('button', `button ${cls}${primary ? ' primary' : ''}${danger ? ' danger' : ''}`)
  node.type = 'button'
  node.textContent = label
  node.disabled = disabled
  node.addEventListener('click', onClick)
  return node
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

function formatDate(publishedAt) {
  if (!publishedAt) return ''
  return new Date(publishedAt).toLocaleDateString('zh-CN')
}

function isLatest(version) {
  return snapshot?.latestVersion === version
}

function isCurrent(version) {
  return snapshot?.selectedVersion === version
}

/* ── versions ──────────────────────────────────────────────── */
function renderInstalledVersion(item) {
  const row = el('div', 'version-row')
  const name = el('span', 'version-name', item.version)
  row.append(name)

  const meta = el('span', 'version-meta')
  const source = item.source === 'bundled' ? '应用内置版本' : '已安装到本地'
  const family = item.family ? familyMeta(item.family) : ''
  meta.textContent = [source, family].filter(Boolean).join(' · ')
  row.append(meta)

  const badgesWrap = el('span', 'badges-wrap')
  if (isCurrent(item.version)) {
    badgesWrap.append(badge('当前运行', 'active-badge'))
    row.append(badgesWrap)
    return row
  }

  const actions = el('div', 'row-actions')
  actions.append(
    button('切换', {
      disabled: busy || activeInstall() !== null,
      onClick: () => selectVersion(item.version),
    }),
  )
  if (localUninstallingVersion === item.version) {
    actions.append(button('卸载中…', { danger: true, disabled: true }))
  } else if (item.source === 'installed') {
    actions.append(
      button(confirmingVersion === item.version ? '确认卸载' : '卸载', {
        danger: true,
        disabled: busy || activeInstall() !== null,
        onClick: () => {
          if (confirmingVersion === item.version) void uninstallVersion(item.version)
          else {
            confirmingVersion = item.version
            render()
          }
        },
      }),
    )
  }
  row.append(actions)
  return row
}

function renderAvailableVersion(item) {
  const row = el('div', 'version-row')
  const name = el('span', 'version-name', item.version)
  row.append(name)

  const meta = el('span', 'version-meta', formatDate(item.publishedAt))
  row.append(meta)

  const badgesWrap = el('span', 'badges-wrap')
  if (isLatest(item.version)) {
    badgesWrap.append(badge('最新', 'green'), badge('推荐', 'blue'))
  }
  // A version promoted to `latest` keeps its `next` tag on npm; only mark
  // versions that are next-only (still canary) so rc.7 doesn't show both
  // "最新/推荐" and "next".
  if (item.tags?.includes('next') && !isLatest(item.version)) {
    const nextBadge = badge('next', 'next')
    nextBadge.title = '上游 next 标签：预发布候选，可手动安装切换'
    badgesWrap.append(nextBadge)
  }
  if (badgesWrap.childNodes.length > 0) {
    row.append(badgesWrap)
  }

  const actions = el('div', 'row-actions')
  const installed = (snapshot?.installedVersions ?? []).some((entry) => entry.version === item.version)
  const installing = activeInstall()
  if (isCurrent(item.version)) {
    // The selected tree may be gone/corrupted even though the selection
    // string matches; the shell then runs the bundled dsh, so this row must
    // not pretend the version is active.
    actions.append(
      badge(
        snapshot?.selectedVersionFallback ? '不可用' : '使用中',
        snapshot?.selectedVersionFallback ? 'next' : 'gray',
      ),
    )
  } else if (installing === item.version) {
    actions.append(button('安装中…', { disabled: true }))
  } else if (installed) {
    actions.append(
      button('切换', {
        disabled: busy || installing !== null,
        onClick: () => selectVersion(item.version),
      }),
    )
  } else {
    actions.append(button('安装', { disabled: busy || installing !== null, onClick: () => installVersion(item.version) }))
  }
  row.append(actions)
  return row
}

function render() {
  if (!snapshot) return
  autoFollowEl.checked = snapshot.autoFollowLatest ?? true
  autoFollowTitleEl.textContent = (snapshot.autoFollowLatest ?? true) ? '已开启自动更新' : '已关闭自动更新'
  registryInputEl.value = snapshot.npmRegistry ?? ''
  sidebarVersionEl.textContent = snapshot.selectedVersion ? `v${snapshot.selectedVersion}` : '—'

  installedEl.replaceChildren()
  if (snapshot.selectedVersionFallback) {
    const warn = el('div', 'banner warn')
    warn.append(el('span', 'banner-mark', '⚠'))
    const text = el('span')
    text.textContent = `所选版本 ${snapshot.selectedVersion} 已不可用（安装文件缺失或损坏），当前实际运行应用内置版本 ${snapshot.bundledVersion ?? '—'}。可在下方重新切换。`
    warn.append(text)
    installedEl.append(warn)
  }
  const installed = snapshot.installedVersions ?? []
  if (installed.length === 0) {
    installedEl.append(el('div', 'empty', '暂无已安装版本（应用内置版本可用）。'))
  } else {
    for (const item of installed) installedEl.append(renderInstalledVersion(item))
  }

  availableEl.replaceChildren()
  const available = snapshot.availableVersions ?? []
  if (available.length === 0) {
    availableEl.append(
      el(
        'div',
        'empty',
        snapshot.error ? `无法获取官方版本列表：${snapshot.error}` : '官方版本列表为空。',
      ),
    )
  } else {
    const visible = showAllVersions ? available : available.slice(0, VISIBLE_VERSION_LIMIT)
    for (const item of visible) availableEl.append(renderAvailableVersion(item))
    if (available.length > VISIBLE_VERSION_LIMIT) {
      const toggle = el(
        'button',
        'group-toggle-btn',
        showAllVersions ? '收起旧版本' : `显示全部 ${available.length} 个版本`,
      )
      toggle.type = 'button'
      toggle.addEventListener('click', () => {
        showAllVersions = !showAllVersions
        render()
      })
      availableEl.append(toggle)
    }
  }
}

/* ── plugins ───────────────────────────────────────────────── */
const KNOWN_ICONS = {
  'dsh-desktop-host':
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"></rect><path d="M8 21h8M12 17v4"></path></svg>',
  dshmarket:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11h16M4 11l1.5-6h13L20 11M4 11v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9"></path><path d="M9 11v3a3 3 0 0 0 6 0v-3"></path></svg>',
}

function pluginInitial(name) {
  const base = name.startsWith('@') ? name.slice(name.indexOf('/') + 1) : name
  const segment = base.split('-').pop()
  return segment.charAt(0).toUpperCase()
}

function renderPluginIcon(name) {
  const box = el('span', 'plugin-icon')
  const svg = KNOWN_ICONS[name]
  if (svg) box.innerHTML = svg
  else box.textContent = pluginInitial(name)
  return box
}

function renderPluginRow(item) {
  const row = el('div', 'plugin-row')
  row.append(renderPluginIcon(item.name))

  const updateInfo = pluginsState.outdated?.[item.name]
  const body = el('div', 'plugin-body')
  const nameLine = el('div', 'plugin-name')
  const titleSpan = el('span', 'plugin-title', item.name)
  nameLine.append(titleSpan)

  const version = el('span', 'version', item.version ? `v${item.version}${item.local ? ' · 本地' : ''}` : '')
  nameLine.append(version)
  if (updateInfo?.latest) {
    const badgeEl = el('span', 'badge blue', `${updateInfo.current ?? '?'} → ${updateInfo.latest}`)
    badgeEl.title = '检测到新版本，可点击“更新”升级'
    nameLine.append(badgeEl)
  }
  body.append(nameLine)
  if (item.description) body.append(el('div', 'plugin-desc', item.description))
  row.append(body)

  const actions = el('div', 'row-actions')
  if (localUninstallingPlugin === item.name) {
    actions.append(button('卸载中…', { danger: true, disabled: true }))
  } else if (item.managed) {
    const builtInBtn = button('内置', { disabled: true })
    builtInBtn.title = '应用内置核心插件，由桌面宿主统一管理'
    actions.append(builtInBtn)
  } else {
    if (updateInfo?.latest) {
      actions.append(
        button(updatingPlugin === item.name ? '更新中…' : '更新', {
          primary: true,
          disabled: busy || checkingUpdates || updatingPlugin !== null,
          onClick: () => updatePlugin(item.name),
        }),
      )
    }
    actions.append(
      button(confirmingPlugin === item.name ? '确认卸载' : '卸载', {
        danger: true,
        disabled: busy || updatingPlugin !== null,
        onClick: () => {
          if (confirmingPlugin === item.name) void removePluginByName(item.name)
          else {
            confirmingPlugin = item.name
            renderPlugins()
          }
        },
      }),
    )
  }
  row.append(actions)
  return row
}

function renderPlugins() {
  // Mutation responses (add/remove/update) carry { plugins, raw, path } but
  // not `outdated`; without the guard Object.keys(undefined) throws here and
  // leaves the previous busy render frozen on screen.
  const outdated = pluginsState.outdated ?? {}
  pluginCountEl.textContent = pluginsState.plugins.length
  checkUpdatesButton.disabled = busy || checkingUpdates
  const outdatedCount = Object.keys(outdated).length
  updateAllButton.hidden = outdatedCount <= 1
  updateAllButton.disabled = busy || checkingUpdates || updatingAll
  pluginsEl.replaceChildren()
  if (pluginsState.error) {
    pluginsEl.append(el('div', 'empty', pluginsState.error))
    return
  }
  if (pluginsState.plugins.length === 0) {
    pluginsEl.append(el('div', 'empty', 'web profile 尚未安装第三方插件（内置 base / web-app 不在此列表）。'))
    return
  }
  for (const item of pluginsState.plugins) pluginsEl.append(renderPluginRow(item))
}

/* ── actions ───────────────────────────────────────────────── */
async function refresh() {
  busy = true
  confirmingVersion = null
  confirmingPlugin = null
  refreshButton.disabled = true
  refreshButton.classList.add('spinning')
  try {
    if (activePanel === 'plugins') {
      setStatus('正在读取插件列表…')
      pluginsState = await pluginsApi.list()
      pluginsState.outdated = {}
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
    refreshButton.classList.remove('spinning')
    if (activePanel === 'plugins') renderPlugins()
    else render()
  }
}

async function installVersion(version) {
  busy = true
  confirmingVersion = null
  localInstallingVersion = version
  setStatus(`正在安装 DSH ${version}…`)
  render()
  try {
    snapshot = await api.install(version)
    setStatus('')
  } catch (error) {
    setStatus(error?.message ?? `安装 ${version} 失败`, true)
  } finally {
    busy = false
    localInstallingVersion = null
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
  localUninstallingVersion = version
  setStatus(`正在卸载 DSH ${version}…`)
  render()
  try {
    snapshot = await api.uninstall(version)
    setStatus('')
  } catch (error) {
    setStatus(error?.message ?? `卸载 ${version} 失败`, true)
  } finally {
    busy = false
    localUninstallingVersion = null
    render()
  }
}

async function installPluginSpec(spec) {
  busy = true
  confirmingPlugin = null
  pluginInstallButton.textContent = '安装中…'
  pluginInstallButton.disabled = true
  setStatus(`正在安装插件 ${spec}…`)
  renderPlugins()
  try {
    const result = await pluginsApi.add(spec)
    if (result?.error) throw new Error(result.error)
    pluginSpecEl.value = ''
    pluginsState = await refetchPluginList(result)
    setStatus(`插件 ${spec} 已安装，dsh 服务已重启。`)
  } catch (error) {
    setStatus(error?.message ?? `安装 ${spec} 失败`, true)
  } finally {
    busy = false
    pluginInstallButton.textContent = '安装'
    pluginInstallButton.disabled = false
    renderPlugins()
  }
}

async function removePluginByName(spec) {
  busy = true
  confirmingPlugin = null
  localUninstallingPlugin = spec
  setStatus(`正在卸载插件 ${spec}…`)
  renderPlugins()
  try {
    const result = await pluginsApi.remove(spec)
    if (result?.error) throw new Error(result.error)
    pluginsState = await refetchPluginList(result)
    setStatus(`插件 ${spec} 已卸载，dsh 服务已重启。`)
  } catch (error) {
    setStatus(error?.message ?? `卸载 ${spec} 失败`, true)
  } finally {
    busy = false
    localUninstallingPlugin = null
    renderPlugins()
  }
}

async function checkUpdates() {
  if (busy || checkingUpdates) return
  checkingUpdates = true
  confirmingPlugin = null
  setStatus('正在检查插件更新…')
  try {
    pluginsState.outdated = await pluginsApi.outdated()
    const count = Object.keys(pluginsState.outdated).length
    setStatus(count > 0 ? `发现 ${count} 个插件有可用更新` : '所有插件均已是最新')
  } catch (error) {
    setStatus(error?.message ?? '检查插件更新失败', true)
  } finally {
    checkingUpdates = false
    renderPlugins()
  }
}

async function updatePlugin(name) {
  busy = true
  confirmingPlugin = null
  updatingPlugin = name
  setStatus(`正在更新 ${name}…`)
  renderPlugins()
  try {
    const result = await pluginsApi.update(name)
    if (result?.error) throw new Error(result.error)
    pluginsState = await refetchPluginList(result)
    try {
      pluginsState.outdated = await pluginsApi.outdated()
    } catch {
      pluginsState.outdated = {}
    }
    setStatus(`插件 ${name} 已更新，dsh 服务已重启。`)
  } catch (error) {
    setStatus(error?.message ?? `更新 ${name} 失败`, true)
  } finally {
    busy = false
    updatingPlugin = null
    renderPlugins()
  }
}

async function updateAllPlugins() {
  const names = Object.keys(pluginsState.outdated)
  if (names.length === 0 || busy) return
  busy = true
  confirmingPlugin = null
  updatingAll = true
  const errors = []
  setStatus(`正在更新插件（0/${names.length}）…`)
  renderPlugins()
  try {
    for (let i = 0; i < names.length; i += 1) {
      const name = names[i]
      setStatus(`正在更新插件 ${name}（${i + 1}/${names.length}）…`)
      try {
        const result = await pluginsApi.update(name)
        if (result?.error) throw new Error(result.error)
      } catch (error) {
        errors.push(`${name}：${error?.message ?? '更新失败'}`)
      }
    }
    try {
      pluginsState = await pluginsApi.list()
      pluginsState.outdated = await pluginsApi.outdated()
    } catch {
      // Keep the current list; the update results are still reported below.
    }
    setStatus(
      errors.length === 0
        ? `已更新 ${names.length} 个插件。`
        : `更新完成，${errors.length} 个失败：${errors.join('；')}`,
      errors.length > 0,
    )
  } finally {
    busy = false
    updatingAll = false
    renderPlugins()
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

function setPanel(panel) {
  activePanel = panel
  for (const nav of navButtons) nav.classList.toggle('active', nav.dataset.panel === panel)
  for (const [name, node] of Object.entries(panels)) node.hidden = name !== panel
  titleEl.textContent = PAGE_META[panel].title
  subtitleEl.textContent = PAGE_META[panel].subtitle
  setStatus('')
}

/* ── events ────────────────────────────────────────────────── */
refreshButton.addEventListener('click', () => void refresh())
checkUpdatesButton.addEventListener('click', () => void checkUpdates())
updateAllButton.addEventListener('click', () => void updateAllPlugins())
for (const nav of navButtons) {
  nav.addEventListener('click', () => {
    setPanel(nav.dataset.panel)
    void refresh()
  })
}
pluginForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const spec = pluginSpecEl.value.trim()
  if (!spec || busy) return
  void installPluginSpec(spec)
})
autoFollowEl.addEventListener('change', async () => {
  try {
    snapshot = await api.setAutoFollow(autoFollowEl.checked)
    setStatus(autoFollowEl.checked ? '已开启自动更新。' : '已关闭自动更新。')
    render()
  } catch (error) {
    setStatus(error?.message ?? '保存自动更新设置失败', true)
    render()
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

/* ── registry combobox (custom dropdown; native datalist is unstyleable) ── */
function setRegistryMenu(open) {
  registryMenuEl.hidden = !open
  registryComboEl.classList.toggle('open', open)
  registryToggleEl.setAttribute('aria-expanded', String(open))
  if (open) {
    const current = registryInputEl.value.trim()
    for (const option of registryMenuEl.querySelectorAll('.combobox-option')) {
      option.classList.toggle('selected', option.dataset.value === current)
    }
  }
}

registryToggleEl.addEventListener('click', () => {
  const open = registryMenuEl.hidden
  setRegistryMenu(open)
  if (open) registryInputEl.focus()
})
registryInputEl.addEventListener('focus', () => setRegistryMenu(true))
registryInputEl.addEventListener('click', () => setRegistryMenu(true))
registryInputEl.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setRegistryMenu(false)
})
for (const option of registryMenuEl.querySelectorAll('.combobox-option')) {
  option.addEventListener('click', () => {
    registryInputEl.value = option.dataset.value
    setRegistryMenu(false)
  })
}
document.addEventListener('pointerdown', (event) => {
  if (!registryMenuEl.hidden && !registryComboEl.contains(event.target)) setRegistryMenu(false)
})
api.onProgress((progress) => {
  if (progress?.message) setStatus(progress.message, progress.phase === 'failed')
})
api.onSnapshot((next) => {
  snapshot = next
  render()
})

function applyTheme(theme) {
  const scheme = theme?.colorScheme
  document.documentElement.dataset.theme = scheme === 'dark' ? 'dark' : 'light'
}

api.getTheme()
  .then((theme) => applyTheme(theme))
  .catch(() => {})
api.onTheme((theme) => applyTheme(theme))

api.getSnapshot()
  .then((next) => {
    snapshot = next
    render()
    if (!next.latestVersion && !next.availableVersions?.length) return refresh()
    return undefined
  })
  .catch((error) => setStatus(error?.message ?? '无法读取版本信息', true))
