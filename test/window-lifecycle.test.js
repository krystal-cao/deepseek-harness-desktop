import assert from 'node:assert/strict'
import test from 'node:test'
import { createTrayMenuTemplate, shouldHideWindowOnClose } from '../src/window-lifecycle.js'

test('window close hides the app unless it is quitting', () => {
  assert.equal(shouldHideWindowOnClose(false), true)
  assert.equal(shouldHideWindowOnClose(true), false)
  assert.equal(shouldHideWindowOnClose(false, false), false)
})

test('tray menu exposes show, hide, and quit actions', () => {
  const actions = []
  const menu = createTrayMenuTemplate({
    locale: 'zh-CN',
    showWindow: () => actions.push('show'),
    hideWindow: () => actions.push('hide'),
    quit: () => actions.push('quit'),
  })

  assert.deepEqual(menu.map(({ label, type }) => label ?? type), [
    '打开 DeepSeek Harness',
    '隐藏窗口',
    'separator',
    '退出',
  ])

  menu[0].click()
  menu[1].click()
  menu[3].click()
  assert.deepEqual(actions, ['show', 'hide', 'quit'])
})

test('tray menu falls back to English labels', () => {
  const menu = createTrayMenuTemplate({
    locale: 'en-US',
    showWindow() {},
    hideWindow() {},
    quit() {},
  })

  assert.deepEqual(menu.map(({ label, type }) => label ?? type), [
    'Open DeepSeek Harness',
    'Hide Window',
    'separator',
    'Quit',
  ])
})
