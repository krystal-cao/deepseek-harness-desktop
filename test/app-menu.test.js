import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAppMenuTemplate } from '../src/app-menu.js'

const collect = (items, target = []) => {
  for (const item of items) {
    if (item.type === 'separator') continue
    target.push(item)
    if (Array.isArray(item.submenu)) collect(item.submenu, target)
  }
  return target
}

test('macOS menu template is fully in Chinese with expected roles', () => {
  const template = buildAppMenuTemplate({
    platform: 'darwin',
    appName: 'DSH',
    onCheckForUpdates: () => {},
    onRestartService: () => {},
    onOpenVersionManager: () => {},
    onOpenGithub: () => {},
  })
  const topLevel = template.map((item) => item.label)
  assert.deepEqual(topLevel, [
    'DSH',
    '文件',
    '编辑',
    '视图',
    '窗口',
    '帮助',
  ])

  const items = collect(template)
  const roles = items.map((item) => item.role).filter(Boolean)
  for (const role of ['about', 'services', 'hide', 'hideOthers', 'unhide', 'quit', 'close']) {
    assert.ok(roles.includes(role), `missing role ${role}`)
  }
  for (const label of ['撤销', '重做', '剪切', '复制', '粘贴', '全选', '重新加载', '设置…', '重启 dsh 服务', '检查更新…', '在 GitHub 上查看']) {
    assert.ok(items.some((item) => item.label === label), `missing label ${label}`)
  }
  assert.ok(items.every(
    (item) => item.label === 'DSH' || /[\u4e00-\u9fff]/.test(item.label ?? ''),
  ))

  // The DSH options are hosted in the first menu (the app menu), directly below 关于.
  const appMenu = template[0]
  const dshLabels = appMenu.submenu
    .filter((item) => ['设置…', '重启 dsh 服务', '检查更新…'].includes(item.label))
    .map((item) => item.label)
  assert.deepEqual(dshLabels, ['设置…', '重启 dsh 服务', '检查更新…'])
  const aboutIndex = appMenu.submenu.findIndex((item) => item.role === 'about')
  assert.ok(aboutIndex !== -1)
  assert.equal(appMenu.submenu[aboutIndex + 1].label, '设置…')
  assert.equal(appMenu.submenu[aboutIndex + 1].accelerator, 'CmdOrCtrl+,')

  // The 帮助 menu now only surfaces the project link.
  const helpMenu = template.find((item) => item.label === '帮助')
  assert.deepEqual(helpMenu.submenu.map((item) => item.label), ['在 GitHub 上查看'])
})

test('non-macOS template has no mac-only app menu or roles', () => {
  const template = buildAppMenuTemplate({ platform: 'linux' })
  assert.equal(template[0].label, '文件')
  const items = collect(template)
  assert.ok(items.every((item) => !['about', 'services', 'front'].includes(item.role)))
})

test('non-macOS hosts the DSH options at the top of the 文件 menu', () => {
  const template = buildAppMenuTemplate({
    platform: 'linux',
    onCheckForUpdates: () => {},
    onRestartService: () => {},
    onOpenVersionManager: () => {},
    onOpenGithub: () => {},
  })
  const fileMenu = template[0]
  assert.deepEqual(
    fileMenu.submenu.map((item) => item.label ?? '[separator]'),
    ['设置…', '重启 dsh 服务', '检查更新…', '[separator]', '退出'],
  )
})

test('macOS menu template supports English language option', () => {
  const template = buildAppMenuTemplate({
    platform: 'darwin',
    appName: 'DSH',
    language: 'en',
    onCheckForUpdates: () => {},
    onRestartService: () => {},
    onOpenVersionManager: () => {},
    onOpenGithub: () => {},
  })
  const topLevel = template.map((item) => item.label)
  assert.deepEqual(topLevel, [
    'DSH',
    'File',
    'Edit',
    'View',
    'Window',
    'Help',
  ])
  const items = collect(template)
  for (const label of ['Settings…', 'Restart DSH Service', 'Check for Updates…', 'Undo', 'Redo', 'Cut', 'Copy', 'Paste', 'Select All', 'Reload', 'View on GitHub']) {
    assert.ok(items.some((item) => item.label === label), `missing English label ${label}`)
  }
})

