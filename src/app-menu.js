// Chinese application menu template for the desktop shell. Kept free of
// Electron imports so the label/role wiring can be unit-tested.

export function buildAppMenuTemplate({
  appName = 'DSH',
  onCheckForUpdates,
  onRestartService,
  onOpenVersionManager,
  onOpenGithub,
  icons = {},
  platform = process.platform,
} = {}) {
  const isMac = platform === 'darwin'
  const template = []

  // The DSH service options, in a fixed order: 设置 → 重启 dsh 服务 → 检查更新.
  const dshMenuItems = [
    ...(onOpenVersionManager ? [{ label: '设置', click: onOpenVersionManager, ...(icons.settings ? { icon: icons.settings } : {}) }] : []),
    ...(onRestartService ? [{ label: '重启 dsh 服务', click: onRestartService, ...(icons.restart ? { icon: icons.restart } : {}) }] : []),
    ...(onCheckForUpdates ? [{ label: '检查更新…', click: onCheckForUpdates, ...(icons.update ? { icon: icons.update } : {}) }] : []),
  ]

  if (isMac) {
    template.push({
      label: appName,
      submenu: [
        { role: 'about', label: `关于 ${appName}` },
        ...dshMenuItems,
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    })
  }

  template.push(
    {
      label: '文件',
      submenu: [
        // On non-Mac the DSH options live in 文件 (kept at the top for
        // consistency with the macOS app menu placement below 关于).
        ...(isMac ? [] : [...dshMenuItems, ...(dshMenuItems.length ? [{ type: 'separator' }] : [])]),
        ...(isMac ? [{ role: 'close', label: '关闭窗口' }] : [{ role: 'quit', label: '退出' }]),
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front', label: '全部置于前台' }] : []),
      ],
    },
  )

  template.push({
    label: '帮助',
    role: 'help',
    submenu: [
      ...(onOpenGithub ? [{ label: '在 GitHub 上查看', click: onOpenGithub }] : []),
    ],
  })

  return template
}
