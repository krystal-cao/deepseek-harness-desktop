const api = window.dshVersions
const pluginsApi = window.dshPlugins

/* ── bilingual dictionary (zh/en) ─────────────────────────── */
const DICTS = {
  zh: {
    // Navigation
    navGeneral: '通用',
    navVersions: '版本',
    navPlugins: '插件',

    // Titles & Subtitles
    pageGeneralTitle: '通用设置',
    pageGeneralSubtitle: '自动更新、镜像源与端口配置',
    pageVersionsTitle: '版本管理',
    pageVersionsSubtitle: '管理 dsh 的版本',
    pagePluginsTitle: '插件管理',
    pagePluginsSubtitle: '发现并管理 dsh 插件',

    // General Panel
    autoFollowOn: '已开启自动更新',
    autoFollowOff: '已关闭自动更新',
    autoFollowDesc: '启动后自动安装并切换到官方最新 RC（完成后自动重启 dsh 服务）',

    translateCommandsOn: '已开启命令说明汉化',
    translateCommandsOff: '已关闭命令说明汉化',
    translateCommandsDesc: '将 /compact、/plan、/permission 等内置斜杠命令的说明提示汉化为简体中文',

    uiThemeTitle: '界面主题',
    uiThemeDesc: '选择 DSH 的配色风格，修改后立即生效',
    uiThemeDefault: '默认主题',
    uiThemeClaude: 'Claude Code 主题',
    themeConflictWarning: (theme) => `已检测到第三方主题（${theme}），内置主题已锁定以避免样式冲突。`,

    npmRegistryTitle: 'npm 镜像地址',
    npmRegistryDesc: '用于版本目录、插件安装和插件管理，内置镜像失效时可切换备用镜像',
    mirrorChina: 'npmmirror（国内）',
    mirrorOfficial: 'npm 官方',
    mirrorTencent: '腾讯云',
    mirrorHuawei: '华为云',

    portTitle: 'DSH 启动端口',
    portDesc: 'DSH 服务监听的本地端口，修改后需重启应用生效。默认 3080。',

    btnSave: '保存',
    btnResetDefault: '恢复默认',
    portInvalid: '端口号必须是 1024–65535 之间的整数',

    // Versions Panel
    installedSectionTitle: '已安装',
    officialSectionTitle: '官方版本',
    npmViewAllLink: '前往 npm 查看全部 →',
    versionsHint: '最新 = npm latest（推荐）；标记 <span class="badge next">next</span> 的为上游预发布候选，可手动安装切换。',
    badgeActive: '运行中',
    badgeBundled: '内置',
    badgeLatest: '最新',
    btnSwitch: '切换',
    btnInstall: '安装',
    btnUninstall: '卸载',
    btnInstalling: '正在安装…',
    btnCurrent: '已是当前版本',
    confirmUninstallTitle: '确定卸载？',
    confirmCancel: '取消',
    confirmYes: '确定',
    showMore: (n) => `查看更多历史版本（共 ${n} 个）↓`,
    showLess: '收起历史版本 ↑',
    noVersionsFound: '未找到可用版本',

    // Plugins Panel
    pluginPlaceholder: '例如 dshmarket、@scope/name 或 github:owner/repo',
    btnPluginInstall: '安装',
    pluginsHint: '通过 dsh 的插件机制安装到 web profile，安装或卸载成功后会自动重启 dsh 服务。',
    installedPluginsSegment: '已安装',
    btnCheckUpdates: '检查更新',
    btnCheckingUpdates: '正在检查…',
    btnUpdateAll: '全部更新',
    badgeBuiltin: '内置',
    badgeHasUpdate: '有新版本',
    btnUpdate: '更新',
    btnUpdating: '正在更新…',
    btnUninstalling: '正在卸载…',
    noPlugins: '暂无已安装的第三方插件',
    confirmPluginUninstallTitle: '确定卸载此插件？',

    // Status Messages
    setFailed: '设置失败',
    saveRegistrySuccess: 'npm 镜像地址已更新',
    savePortSuccess: (p) => `DSH 端口已修改为 ${p}，重启应用后生效`,
    savePortResetSuccess: 'DSH 端口已恢复为默认值（3080），重启应用后生效',
    switchSuccess: (v) => `已切换到 v${v}，服务重启中…`,
    installSuccess: (v) => `v${v} 安装完成`,
    uninstallSuccess: (v) => `v${v} 已卸载`,
    pluginInstallSuccess: (s) => `插件 ${s} 安装成功，服务重启中…`,
    pluginUninstallSuccess: (p) => `插件 ${p} 已卸载，服务重启中…`,
    pluginUpdateSuccess: (p) => `插件 ${p} 更新成功，服务重启中…`,
    pluginsAllUpdatedSuccess: '全部插件已更新至最新版本',
    pluginsUpToDate: '所有插件均已是最新版本',
    refreshPluginsTimeout: '刷新插件列表超时',
  },
  en: {
    // Navigation
    navGeneral: 'General',
    navVersions: 'Versions',
    navPlugins: 'Plugins',

    // Titles & Subtitles
    pageGeneralTitle: 'General Settings',
    pageGeneralSubtitle: 'Auto-updates, mirror registries, and port configuration',
    pageVersionsTitle: 'Version Manager',
    pageVersionsSubtitle: 'Manage DSH runtime versions',
    pagePluginsTitle: 'Plugin Manager',
    pagePluginsSubtitle: 'Discover and manage DSH plugins',

    // General Panel
    autoFollowOn: 'Auto-update enabled',
    autoFollowOff: 'Auto-update disabled',
    autoFollowDesc: 'Automatically install and switch to latest official RC on launch (restarts dsh service when done)',

    translateCommandsOn: 'Command localization enabled',
    translateCommandsOff: 'Command localization disabled',
    translateCommandsDesc: 'Translate /compact, /plan, /permission slash command descriptions into Chinese',

    uiThemeTitle: 'UI Theme',
    uiThemeDesc: 'Select DSH appearance; changes apply immediately',
    uiThemeDefault: 'Default Theme',
    uiThemeClaude: 'Claude Code Theme',
    themeConflictWarning: (theme) => `Third-party theme detected (${theme}); built-in themes locked to prevent conflicts.`,

    npmRegistryTitle: 'npm Registry',
    npmRegistryDesc: 'Used for version catalog, plugin install, and updates; switch if default fails',
    mirrorChina: 'npmmirror (China)',
    mirrorOfficial: 'npm Official',
    mirrorTencent: 'Tencent Cloud',
    mirrorHuawei: 'Huawei Cloud',

    portTitle: 'DSH Port',
    portDesc: 'Local port monitored by DSH service; takes effect after app restart. Default: 3080.',

    btnSave: 'Save',
    btnResetDefault: 'Reset Default',
    portInvalid: 'Port must be an integer between 1024 and 65535',

    // Versions Panel
    installedSectionTitle: 'Installed',
    officialSectionTitle: 'Official Versions',
    npmViewAllLink: 'View all on npm →',
    versionsHint: 'latest = npm latest (recommended); <span class="badge next">next</span> indicates upstream pre-release candidates.',
    badgeActive: 'Active',
    badgeBundled: 'Bundled',
    badgeLatest: 'Latest',
    btnSwitch: 'Switch',
    btnInstall: 'Install',
    btnUninstall: 'Uninstall',
    btnInstalling: 'Installing…',
    btnCurrent: 'Current',
    confirmUninstallTitle: 'Uninstall this version?',
    confirmCancel: 'Cancel',
    confirmYes: 'Confirm',
    showMore: (n) => `Show more versions (${n} total) ↓`,
    showLess: 'Show less ↑',
    noVersionsFound: 'No available versions found',

    // Plugins Panel
    pluginPlaceholder: 'e.g. dshmarket, @scope/name, or github:owner/repo',
    btnPluginInstall: 'Install',
    pluginsHint: 'Installed into web profile via DSH plugin mechanism; service restarts automatically.',
    installedPluginsSegment: 'Installed',
    btnCheckUpdates: 'Check Updates',
    btnCheckingUpdates: 'Checking…',
    btnUpdateAll: 'Update All',
    badgeBuiltin: 'Built-in',
    badgeHasUpdate: 'Update Available',
    btnUpdate: 'Update',
    btnUpdating: 'Updating…',
    btnUninstalling: 'Uninstalling…',
    noPlugins: 'No third-party plugins installed',
    confirmPluginUninstallTitle: 'Uninstall this plugin?',

    // Status Messages
    setFailed: 'Setting failed',
    saveRegistrySuccess: 'npm registry updated',
    savePortSuccess: (p) => `DSH port updated to ${p}; takes effect after app restart`,
    savePortResetSuccess: 'DSH port reset to default (3080); takes effect after app restart',
    switchSuccess: (v) => `Switched to v${v}, restarting service…`,
    installSuccess: (v) => `v${v} installed successfully`,
    uninstallSuccess: (v) => `v${v} uninstalled`,
    pluginInstallSuccess: (s) => `Plugin ${s} installed, restarting service…`,
    pluginUninstallSuccess: (p) => `Plugin ${p} uninstalled, restarting service…`,
    pluginUpdateSuccess: (p) => `Plugin ${p} updated, restarting service…`,
    pluginsAllUpdatedSuccess: 'All plugins updated to latest version',
    pluginsUpToDate: 'All plugins are up to date',
    refreshPluginsTimeout: 'Timed out refreshing plugin list',
  },
}

let activeLang = 'zh'

function t(key, ...args) {
  const dict = DICTS[activeLang] || DICTS.zh
  const val = dict[key] ?? DICTS.zh[key]
  if (typeof val === 'function') return val(...args)
  return val ?? key
}

function setLanguage(lang) {
  activeLang = lang === 'en' ? 'en' : 'zh'
}

function getLanguage() {
  return activeLang
}

const titleEl = document.getElementById('page-title')
const subtitleEl = document.getElementById('page-subtitle')
const refreshButton = document.getElementById('refresh')
const statusEl = document.getElementById('status')
const sidebarVersionEl = document.getElementById('sidebar-version')
const autoFollowEl = document.getElementById('auto-follow')
const autoFollowTitleEl = document.getElementById('auto-follow-title')
const translateCommandsEl = document.getElementById('translate-commands')
const translateCommandsTitleEl = document.getElementById('translate-commands-title')
const uiThemeEls = [...document.querySelectorAll('input[name="ui-theme"]')]
const themeWarningEl = document.getElementById('theme-conflict-warning')
const registryInputEl = document.getElementById('registry-input')
const registrySaveEl = document.getElementById('registry-save')
const registryResetEl = document.getElementById('registry-reset')
const registryComboEl = document.getElementById('registry-combo')
const registryToggleEl = document.getElementById('registry-toggle')
const registryMenuEl = document.getElementById('registry-menu')
const portInputEl = document.getElementById('port-input')
const portSaveEl = document.getElementById('port-save')
const portResetEl = document.getElementById('port-reset')
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
  general: document.getElementById('panel-general'),
  versions: document.getElementById('panel-versions'),
  plugins: document.getElementById('panel-plugins'),
}

function getPageMeta(panel) {
  switch (panel) {
    case 'versions':
      return { title: t('pageVersionsTitle'), subtitle: t('pageVersionsSubtitle') }
    case 'plugins':
      return { title: t('pagePluginsTitle'), subtitle: t('pagePluginsSubtitle') }
    case 'general':
    default:
      return { title: t('pageGeneralTitle'), subtitle: t('pageGeneralSubtitle') }
  }
}

let snapshot = null
let busy = false
let confirmingVersion = null
let confirmingPlugin = null
let pluginsState = { plugins: [], error: null }
let checkingUpdates = false
let updatingPlugin = null
let updatingAll = false
let activePanel = 'general'
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
      new Promise((_, reject) => setTimeout(() => reject(new Error(t('refreshPluginsTimeout'))), 10_000)),
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

function formatDate(publishedAt) {
  if (!publishedAt) return ''
  const locale = getLanguage() === 'en' ? 'en-US' : 'zh-CN'
  return new Date(publishedAt).toLocaleDateString(locale)
}

function isLatest(version) {
  return snapshot?.latestVersion === version
}

function isCurrent(version) {
  return snapshot?.selectedVersion === version
}

function familyMeta(family = []) {
  const total = family.length
  const aligned = family.filter((item) => item.aligned).length
  if (total === 0) return ''
  const isEn = getLanguage() === 'en'
  if (aligned === total) {
    return isEn ? `Plugin family ${total}/${total} aligned` : `插件族 ${total}/${total} 对齐`
  }
  const missing = family
    .filter((item) => !item.aligned)
    .slice(0, 3)
    .map((item) => item.name.replace('@deepseek-ai/', ''))
  const suffix = total - aligned > 3 ? '…' : ''
  return isEn
    ? `Plugin family ${aligned}/${total} aligned (missing ${missing.join(', ')}${suffix})`
    : `插件族 ${aligned}/${total} 对齐（缺 ${missing.join(', ')}${suffix}）`
}

/* ── static i18n synchronization ───────────────────────────── */
function applyStaticI18n() {
  updateHeader()
  for (const node of document.querySelectorAll('[data-i18n]')) {
    const key = node.dataset.i18n
    if (key) node.textContent = t(key)
  }
  for (const node of document.querySelectorAll('[data-i18n-html]')) {
    const key = node.dataset.i18nHtml
    if (key) node.innerHTML = t(key)
  }
  for (const node of document.querySelectorAll('[data-i18n-placeholder]')) {
    const key = node.dataset.i18nPlaceholder
    if (key) node.placeholder = t(key)
  }
  for (const node of document.querySelectorAll('[data-i18n-title]')) {
    const key = node.dataset.i18nTitle
    if (key) node.title = t(key)
  }
}

/* ── versions ──────────────────────────────────────────────── */
function renderInstalledVersion(item) {
  const row = el('div', 'version-row')
  const name = el('span', 'version-name', item.version)
  row.append(name)

  const meta = el('span', 'version-meta')
  const isEn = getLanguage() === 'en'
  const source = item.source === 'bundled'
    ? (isEn ? 'Bundled with app' : '应用内置版本')
    : (isEn ? 'Installed locally' : '已安装到本地')
  const family = item.family ? familyMeta(item.family) : ''
  meta.textContent = [source, family].filter(Boolean).join(' · ')
  row.append(meta)

  const badgesWrap = el('span', 'badges-wrap')
  if (isCurrent(item.version)) {
    badgesWrap.append(badge(t('badgeActive'), 'active-badge'))
    row.append(badgesWrap)
    return row
  }

  const actions = el('div', 'row-actions')
  actions.append(
    button(t('btnSwitch'), {
      disabled: busy || activeInstall() !== null,
      onClick: () => selectVersion(item.version),
    }),
  )
  if (localUninstallingVersion === item.version) {
    actions.append(button(t('btnUninstalling'), { danger: true, disabled: true }))
  } else if (item.source === 'installed') {
    actions.append(
      button(confirmingVersion === item.version ? t('confirmYes') : t('btnUninstall'), {
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
    badgesWrap.append(badge(t('badgeLatest'), 'green'))
  }
  if (item.tags?.includes('next') && !isLatest(item.version)) {
    const nextBadge = badge('next', 'next')
    nextBadge.title = getLanguage() === 'en'
      ? 'Upstream next tag: pre-release candidate'
      : '上游 next 标签：预发布候选，可手动安装切换'
    badgesWrap.append(nextBadge)
  }
  if (badgesWrap.childNodes.length > 0) {
    row.append(badgesWrap)
  }

  const actions = el('div', 'row-actions')
  const installed = (snapshot?.installedVersions ?? []).some((entry) => entry.version === item.version)
  const installing = activeInstall()
  const isEn = getLanguage() === 'en'
  if (isCurrent(item.version)) {
    actions.append(
      badge(
        snapshot?.selectedVersionFallback
          ? (isEn ? 'Unavailable' : '不可用')
          : (isEn ? 'Active' : '使用中'),
        snapshot?.selectedVersionFallback ? 'next' : 'gray',
      ),
    )
  } else if (installing === item.version) {
    actions.append(button(t('btnInstalling'), { disabled: true }))
  } else if (installed) {
    actions.append(
      button(t('btnSwitch'), {
        disabled: busy || installing !== null,
        onClick: () => selectVersion(item.version),
      }),
    )
  } else {
    actions.append(button(t('btnInstall'), { disabled: busy || installing !== null, onClick: () => installVersion(item.version) }))
  }
  row.append(actions)
  return row
}

function render() {
  if (!snapshot) return
  if (snapshot.language && snapshot.language !== getLanguage()) {
    setLanguage(snapshot.language)
  }
  if (snapshot.colorScheme) {
    applyTheme(snapshot.colorScheme)
  }
  applyStaticI18n()

  autoFollowEl.checked = snapshot.autoFollowLatest ?? true
  autoFollowTitleEl.textContent = (snapshot.autoFollowLatest ?? true) ? t('autoFollowOn') : t('autoFollowOff')
  if (translateCommandsEl) {
    translateCommandsEl.checked = snapshot.translateCommands ?? true
    translateCommandsTitleEl.textContent = (snapshot.translateCommands ?? true) ? t('translateCommandsOn') : t('translateCommandsOff')
  }
  const externalTheme = snapshot.externalTheme
  if (externalTheme) {
    applyUiTheme('default')
    for (const input of uiThemeEls) {
      input.disabled = true
      input.checked = input.value === 'default'
    }
    if (themeWarningEl) {
      themeWarningEl.textContent = t('themeConflictWarning', externalTheme)
      themeWarningEl.hidden = false
    }
  } else {
    applyUiTheme(snapshot.uiTheme)
    for (const input of uiThemeEls) {
      input.disabled = false
      input.checked = input.value === (snapshot.uiTheme === 'claude' ? 'claude' : 'default')
    }
    if (themeWarningEl) {
      themeWarningEl.hidden = true
    }
  }
  registryInputEl.value = snapshot.npmRegistry ?? ''
  portInputEl.value = snapshot.dshPort ?? ''
  sidebarVersionEl.textContent = snapshot.selectedVersion ? `v${snapshot.selectedVersion}` : '—'

  renderVersions()
}

function renderVersions() {
  installedEl.replaceChildren()
  for (const item of snapshot?.installedVersions ?? []) installedEl.append(renderInstalledVersion(item))

  availableEl.replaceChildren()
  const versions = snapshot?.availableVersions ?? []
  if (versions.length === 0) {
    availableEl.append(el('div', 'empty', t('noVersionsFound')))
    return
  }

  const visibleVersions = showAllVersions ? versions : versions.slice(0, VISIBLE_VERSION_LIMIT)
  for (const item of visibleVersions) availableEl.append(renderAvailableVersion(item))

  const remainingCount = versions.length - VISIBLE_VERSION_LIMIT
  if (remainingCount > 0) {
    const toggleRow = el('div', 'toggle-row')
    const toggleButton = button(
      showAllVersions
        ? t('showLess')
        : t('showMore', remainingCount),
      {
        cls: 'ghost toggle-versions-btn',
        onClick: () => {
          showAllVersions = !showAllVersions
          renderVersions()
        },
      },
    )
    toggleRow.append(toggleButton)
    availableEl.append(toggleRow)
  }
}

/* ── plugins ───────────────────────────────────────────────── */
function renderPluginIcon(name) {
  const wrap = el('div', 'plugin-icon')
  const char = (name.replace(/^@[^/]+\//, '')[0] || 'p').toUpperCase()
  wrap.append(document.createTextNode(char))
  return wrap
}

function renderPluginRow(item) {
  const row = el('div', 'plugin-row')
  row.append(renderPluginIcon(item.name))

  const isEn = getLanguage() === 'en'
  const updateInfo = pluginsState.outdated?.[item.name]
  const body = el('div', 'plugin-body')
  const nameLine = el('div', 'plugin-name')
  const titleSpan = el('span', 'plugin-title', item.name)
  nameLine.append(titleSpan)

  const version = el('span', 'version', item.version ? `v${item.version}${item.local ? (isEn ? ' · Local' : ' · 本地') : ''}` : '')
  nameLine.append(version)
  if (updateInfo?.latest) {
    const badgeEl = el('span', 'badge blue', `${updateInfo.current ?? '?'} → ${updateInfo.latest}`)
    badgeEl.title = isEn ? 'New version available' : '检测到新版本，可点击“更新”升级'
    nameLine.append(badgeEl)
  }
  body.append(nameLine)
  if (item.description) body.append(el('div', 'plugin-desc', item.description))
  row.append(body)

  const actions = el('div', 'row-actions')
  if (localUninstallingPlugin === item.name) {
    actions.append(button(t('btnUninstalling'), { danger: true, disabled: true }))
  } else if (item.managed) {
    const wrap = el('span', 'btn-wrap')
    wrap.title = isEn ? 'Built-in core plugin managed by host' : '应用内置核心插件，由桌面宿主统一管理'
    const builtInBtn = button(t('badgeBuiltin'), { disabled: true })
    wrap.append(builtInBtn)
    actions.append(wrap)
  } else {
    if (updateInfo?.latest) {
      actions.append(
        button(updatingPlugin === item.name ? t('btnUpdating') : t('btnUpdate'), {
          primary: true,
          disabled: busy || checkingUpdates || updatingPlugin !== null,
          onClick: () => updatePlugin(item.name),
        }),
      )
    }
    actions.append(
      button(confirmingPlugin === item.name ? t('confirmYes') : t('btnUninstall'), {
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
  const outdated = pluginsState.outdated ?? {}
  pluginCountEl.textContent = pluginsState.plugins.length
  checkUpdatesButton.disabled = busy || checkingUpdates
  if (checkUpdatesButton) checkUpdatesButton.textContent = checkingUpdates ? t('btnCheckingUpdates') : t('btnCheckUpdates')
  const outdatedCount = Object.keys(outdated).length
  updateAllButton.hidden = outdatedCount <= 1
  updateAllButton.disabled = busy || checkingUpdates || updatingAll
  if (updateAllButton) updateAllButton.textContent = t('btnUpdateAll')
  pluginsEl.replaceChildren()
  if (pluginsState.error) {
    pluginsEl.append(el('div', 'empty', pluginsState.error))
    return
  }
  if (pluginsState.plugins.length === 0) {
    pluginsEl.append(el('div', 'empty', t('noPlugins')))
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
      setStatus(getLanguage() === 'en' ? 'Reading plugin list…' : '正在读取插件列表…')
      pluginsState = await pluginsApi.list()
      pluginsState.outdated = {}
      try {
        snapshot = await api.getSnapshot()
      } catch {}
      setStatus('')
    } else {
      setStatus(getLanguage() === 'en' ? 'Refreshing…' : '正在刷新…')
      snapshot = await api.refresh()
      setStatus('')
    }
  } catch (error) {
    setStatus(error?.message ?? (getLanguage() === 'en' ? 'Refresh failed' : '刷新失败'), true)
  } finally {
    busy = false
    refreshButton.disabled = false
    refreshButton.classList.remove('spinning')
    render()
    if (activePanel === 'plugins') renderPlugins()
  }
}

async function installVersion(version) {
  busy = true
  confirmingVersion = null
  localInstallingVersion = version
  setStatus(getLanguage() === 'en' ? `Installing DSH ${version}…` : `正在安装 DSH ${version}…`)
  render()
  try {
    snapshot = await api.install(version)
    setStatus(t('installSuccess', version))
  } catch (error) {
    setStatus(error?.message ?? (getLanguage() === 'en' ? `Failed to install ${version}` : `安装 ${version} 失败`), true)
  } finally {
    busy = false
    localInstallingVersion = null
    render()
  }
}

async function selectVersion(version) {
  busy = true
  confirmingVersion = null
  setStatus(getLanguage() === 'en' ? `Switching to DSH ${version}…` : `正在切换到 DSH ${version}…`)
  try {
    snapshot = await api.select(version)
    setStatus(t('switchSuccess', version))
  } catch (error) {
    setStatus(error?.message ?? (getLanguage() === 'en' ? `Failed to switch to ${version}` : `切换 ${version} 失败`), true)
  } finally {
    busy = false
    render()
  }
}

async function uninstallVersion(version) {
  busy = true
  confirmingVersion = null
  localUninstallingVersion = version
  setStatus(getLanguage() === 'en' ? `Uninstalling DSH ${version}…` : `正在卸载 DSH ${version}…`)
  render()
  try {
    snapshot = await api.uninstall(version)
    setStatus(t('uninstallSuccess', version))
  } catch (error) {
    setStatus(error?.message ?? (getLanguage() === 'en' ? `Failed to uninstall ${version}` : `卸载 ${version} 失败`), true)
  } finally {
    busy = false
    localUninstallingVersion = null
    render()
  }
}

async function installPluginSpec(spec) {
  busy = true
  confirmingPlugin = null
  pluginInstallButton.textContent = t('btnInstalling')
  pluginInstallButton.disabled = true
  setStatus(getLanguage() === 'en' ? `Installing plugin ${spec}…` : `正在安装插件 ${spec}…`)
  renderPlugins()
  try {
    const result = await pluginsApi.add(spec)
    if (result?.error) throw new Error(result.error)
    pluginSpecEl.value = ''
    pluginsState = await refetchPluginList(result)
    try {
      snapshot = await api.getSnapshot()
    } catch {}
    render()
    setStatus(t('pluginInstallSuccess', spec))
  } catch (error) {
    setStatus(error?.message ?? (getLanguage() === 'en' ? `Failed to install ${spec}` : `安装 ${spec} 失败`), true)
  } finally {
    busy = false
    pluginInstallButton.textContent = t('btnPluginInstall')
    pluginInstallButton.disabled = false
    renderPlugins()
  }
}

async function removePluginByName(spec) {
  busy = true
  confirmingPlugin = null
  localUninstallingPlugin = spec
  setStatus(getLanguage() === 'en' ? `Uninstalling plugin ${spec}…` : `正在卸载插件 ${spec}…`)
  renderPlugins()
  try {
    const result = await pluginsApi.remove(spec)
    if (result?.error) throw new Error(result.error)
    pluginsState = await refetchPluginList(result)
    try {
      snapshot = await api.getSnapshot()
    } catch {}
    render()
    setStatus(t('pluginUninstallSuccess', spec))
  } catch (error) {
    setStatus(error?.message ?? (getLanguage() === 'en' ? `Failed to uninstall ${spec}` : `卸载 ${spec} 失败`), true)
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
  setStatus(getLanguage() === 'en' ? 'Checking for plugin updates…' : '正在检查插件更新…')
  try {
    pluginsState.outdated = await pluginsApi.outdated()
    const count = Object.keys(pluginsState.outdated).length
    setStatus(
      count > 0
        ? (getLanguage() === 'en' ? `Found ${count} plugins with available updates` : `发现 ${count} 个插件有可用更新`)
        : t('pluginsUpToDate'),
    )
  } catch (error) {
    setStatus(error?.message ?? (getLanguage() === 'en' ? 'Failed to check updates' : '检查插件更新失败'), true)
  } finally {
    checkingUpdates = false
    renderPlugins()
  }
}

async function updatePlugin(name) {
  busy = true
  confirmingPlugin = null
  updatingPlugin = name
  setStatus(getLanguage() === 'en' ? `Updating ${name}…` : `正在更新 ${name}…`)
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
    setStatus(t('pluginUpdateSuccess', name))
  } catch (error) {
    setStatus(error?.message ?? (getLanguage() === 'en' ? `Failed to update ${name}` : `更新 ${name} 失败`), true)
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
  const isEn = getLanguage() === 'en'
  setStatus(isEn ? `Updating plugins (0/${names.length})…` : `正在更新插件（0/${names.length}）…`)
  renderPlugins()
  try {
    for (let i = 0; i < names.length; i += 1) {
      const name = names[i]
      setStatus(isEn ? `Updating plugin ${name} (${i + 1}/${names.length})…` : `正在更新插件 ${name}（${i + 1}/${names.length}）…`)
      try {
        const result = await pluginsApi.update(name)
        if (result?.error) throw new Error(result.error)
      } catch (error) {
        errors.push(`${name}：${error?.message ?? (isEn ? 'Update failed' : '更新失败')}`)
      }
    }
    try {
      pluginsState = await pluginsApi.list()
      pluginsState.outdated = await pluginsApi.outdated()
    } catch {
      // Keep the current list
    }
    setStatus(
      errors.length === 0
        ? t('pluginsAllUpdatedSuccess')
        : (isEn ? `Update complete, ${errors.length} failed: ${errors.join('; ')}` : `更新完成，${errors.length} 个失败：${errors.join('；')}`),
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
    setStatus(t('saveRegistrySuccess'))
    await refresh()
  } catch (error) {
    setStatus(error?.message ?? t('setFailed'), true)
    registryInputEl.value = snapshot?.npmRegistry ?? ''
  }
}

async function savePort(value) {
  try {
    snapshot = await api.setDshPort(value)
    if (value !== null && value !== 3080 && snapshot?.dshPort !== value) {
      portInputEl.value = snapshot?.dshPort ?? ''
      return
    }
    setStatus(value === null ? t('savePortResetSuccess') : t('savePortSuccess', value))
    render()
  } catch (error) {
    setStatus(error?.message ?? t('setFailed'), true)
    portInputEl.value = snapshot?.dshPort ?? ''
  }
}

function setPanel(panel) {
  activePanel = panel
  for (const nav of navButtons) nav.classList.toggle('active', nav.dataset.panel === panel)
  for (const [name, node] of Object.entries(panels)) node.hidden = name !== panel
  updateHeader()
  refreshButton.hidden = panel === 'general'
  setStatus('')
  if (panel === 'general' || panel === 'versions') render()
  if (panel === 'plugins') renderPlugins()
}

function updateHeader() {
  const meta = getPageMeta(activePanel)
  titleEl.textContent = meta.title
  subtitleEl.textContent = meta.subtitle
  refreshButton.hidden = activePanel === 'general'
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
    render()
  } catch (error) {
    setStatus(error?.message ?? t('setFailed'), true)
    autoFollowEl.checked = !autoFollowEl.checked
  }
})
if (translateCommandsEl) {
  translateCommandsEl.addEventListener('change', async () => {
    try {
      snapshot = await api.setTranslateCommands(translateCommandsEl.checked)
      render()
    } catch (error) {
      setStatus(error?.message ?? t('setFailed'), true)
      translateCommandsEl.checked = !translateCommandsEl.checked
    }
  })
}
registrySaveEl.addEventListener('click', () => {
  const value = registryInputEl.value.trim()
  void saveRegistry(value === '' ? null : value)
})
registryResetEl.addEventListener('click', () => {
  registryInputEl.value = ''
  void saveRegistry(null)
})
portSaveEl.addEventListener('click', () => {
  const raw = portInputEl.value.trim()
  if (raw === '') {
    void savePort(null)
    return
  }
  const num = Number(raw)
  if (!Number.isInteger(num) || num < 1024 || num > 65535) {
    setStatus(t('portInvalid'), true)
    return
  }
  void savePort(num)
})
portResetEl.addEventListener('click', () => {
  portInputEl.value = ''
  void savePort(null)
})

/* ── registry combobox ─────────────────────────────────────── */
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
for (const input of uiThemeEls) {
  input.addEventListener('change', () => {
    if (input.checked) void saveUiTheme(input.value)
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
  if (activePanel === 'plugins') renderPlugins()
})

function applyUiTheme(theme) {
  const root = document.documentElement
  if (theme === 'claude') {
    root.setAttribute('data-ui-theme', 'claude')
  } else {
    root.removeAttribute('data-ui-theme')
  }
}

async function saveUiTheme(theme) {
  try {
    snapshot = await api.setUiTheme(theme)
    render()
  } catch (error) {
    setStatus(error?.message ?? t('setFailed'), true)
    render()
  }
}

function applyTheme(theme) {
  const mode = typeof theme === 'object' && theme !== null ? theme.colorScheme : theme
  const root = document.documentElement
  if (mode === 'dark') {
    root.setAttribute('data-theme', 'dark')
    root.classList.add('dark')
    root.classList.remove('light')
  } else {
    root.removeAttribute('data-theme')
    root.classList.add('light')
    root.classList.remove('dark')
  }
}

api.onTheme?.((theme) => {
  applyTheme(theme)
})

async function init() {
  try {
    const [snap, themeRes] = await Promise.all([
      api.getSnapshot(),
      api.getTheme?.().catch(() => null),
    ])
    snapshot = snap
    if (themeRes) applyTheme(themeRes)
    render()
  } catch (error) {
    setStatus(error?.message ?? (getLanguage() === 'en' ? 'Initialization failed' : '初始化失败'), true)
  }
}

void init()
