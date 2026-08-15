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
    appName: 'DeepSeek Harness',
    onCheckForUpdates: () => {},
  })
  const topLevel = template.map((item) => item.label)
  assert.deepEqual(topLevel, [
    'DeepSeek Harness',
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
  for (const label of ['撤销', '重做', '剪切', '复制', '粘贴', '全选', '重新加载', '检查更新…']) {
    assert.ok(items.some((item) => item.label === label), `missing label ${label}`)
  }
  assert.ok(items.every(
    (item) => item.label === 'DeepSeek Harness' || /[\u4e00-\u9fff]/.test(item.label ?? ''),
  ))
})

test('non-macOS template has no mac-only app menu or roles', () => {
  const template = buildAppMenuTemplate({ platform: 'linux' })
  assert.equal(template[0].label, '文件')
  const items = collect(template)
  assert.ok(items.every((item) => !['about', 'services', 'front'].includes(item.role)))
})
