// Application menu template for the desktop shell with bilingual support (zh/en).
// Kept free of Electron imports so the label/role wiring can be unit-tested.

const MENU_TEXT = {
  zh: {
    settings: '设置…',
    restartService: '重启 dsh 服务',
    checkUpdates: '检查更新…',
    about: (app) => `关于 ${app}`,
    services: '服务',
    hide: '隐藏',
    hideOthers: '隐藏其他',
    showAll: '全部显示',
    quit: '退出',
    file: '文件',
    closeWindow: '关闭窗口',
    edit: '编辑',
    undo: '撤销',
    redo: '重做',
    cut: '剪切',
    copy: '复制',
    paste: '粘贴',
    selectAll: '全选',
    view: '视图',
    reload: '重新加载',
    forceReload: '强制重新加载',
    actualSize: '实际大小',
    zoomIn: '放大',
    zoomOut: '缩小',
    toggleFullScreen: '切换全屏',
    window: '窗口',
    minimize: '最小化',
    zoom: '缩放',
    bringAllToFront: '全部置于前台',
    help: '帮助',
    viewOnGithub: '在 GitHub 上查看',
  },
  en: {
    settings: 'Settings…',
    restartService: 'Restart DSH Service',
    checkUpdates: 'Check for Updates…',
    about: (app) => `About ${app}`,
    services: 'Services',
    hide: 'Hide',
    hideOthers: 'Hide Others',
    showAll: 'Show All',
    quit: 'Quit',
    file: 'File',
    closeWindow: 'Close Window',
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    view: 'View',
    reload: 'Reload',
    forceReload: 'Force Reload',
    actualSize: 'Actual Size',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    toggleFullScreen: 'Toggle Full Screen',
    window: 'Window',
    minimize: 'Minimize',
    zoom: 'Zoom',
    bringAllToFront: 'Bring All to Front',
    help: 'Help',
    viewOnGithub: 'View on GitHub',
  },
}

export function buildAppMenuTemplate({
  appName = 'DSH',
  onCheckForUpdates,
  onRestartService,
  onOpenVersionManager,
  onOpenGithub,
  platform = process.platform,
  language = 'zh',
} = {}) {
  const isMac = platform === 'darwin'
  const t = language === 'en' ? MENU_TEXT.en : MENU_TEXT.zh
  const template = []

  // The DSH service options, in a fixed order: Settings… → Restart dsh service → Check for updates….
  const dshMenuItems = [
    ...(onOpenVersionManager ? [{ label: t.settings, accelerator: 'CmdOrCtrl+,', click: onOpenVersionManager }] : []),
    ...(onRestartService ? [{ label: t.restartService, click: onRestartService }] : []),
    ...(onCheckForUpdates ? [{ label: t.checkUpdates, click: onCheckForUpdates }] : []),
  ]

  if (isMac) {
    template.push({
      label: appName,
      submenu: [
        { role: 'about', label: t.about(appName) },
        ...dshMenuItems,
        { type: 'separator' },
        { role: 'services', label: t.services },
        { type: 'separator' },
        { role: 'hide', label: t.hide },
        { role: 'hideOthers', label: t.hideOthers },
        { role: 'unhide', label: t.showAll },
        { type: 'separator' },
        { role: 'quit', label: t.quit },
      ],
    })
  }

  template.push(
    {
      label: t.file,
      submenu: [
        // On non-Mac the DSH options live in File (kept at the top for
        // consistency with the macOS app menu placement below About).
        ...(isMac ? [] : [...dshMenuItems, ...(dshMenuItems.length ? [{ type: 'separator' }] : [])]),
        ...(isMac ? [{ role: 'close', label: t.closeWindow }] : [{ role: 'quit', label: t.quit }]),
      ],
    },
    {
      label: t.edit,
      submenu: [
        { role: 'undo', label: t.undo },
        { role: 'redo', label: t.redo },
        { type: 'separator' },
        { role: 'cut', label: t.cut },
        { role: 'copy', label: t.copy },
        { role: 'paste', label: t.paste },
        { role: 'selectAll', label: t.selectAll },
      ],
    },
    {
      label: t.view,
      submenu: [
        { role: 'reload', label: t.reload },
        { role: 'forceReload', label: t.forceReload },
        { type: 'separator' },
        { role: 'resetZoom', label: t.actualSize },
        { role: 'zoomIn', label: t.zoomIn },
        { role: 'zoomOut', label: t.zoomOut },
        { type: 'separator' },
        { role: 'togglefullscreen', label: t.toggleFullScreen },
      ],
    },
    {
      label: t.window,
      submenu: [
        { role: 'minimize', label: t.minimize },
        { role: 'zoom', label: t.zoom },
        ...(isMac ? [{ type: 'separator' }, { role: 'front', label: t.bringAllToFront }] : []),
      ],
    },
  )

  template.push({
    label: t.help,
    role: 'help',
    submenu: [
      ...(onOpenGithub ? [{ label: t.viewOnGithub, click: onOpenGithub }] : []),
    ],
  })

  return template
}
