import assert from 'node:assert/strict'
import test from 'node:test'
import { createWindowOptions } from '../src/window-options.js'

test('macOS uses hiddenInset traffic lights without a title bar overlay', () => {
  const options = createWindowOptions('darwin')

  assert.equal(options.titleBarStyle, 'hiddenInset')
  assert.equal(options.titleBarOverlay, undefined)
  assert.deepEqual(options.trafficLightPosition, { x: 16, y: 18 })
})

test('Windows keeps the menu bar hidden', () => {
  const options = createWindowOptions('win32')

  assert.equal(options.autoHideMenuBar, true)
  assert.equal(options.titleBarStyle, 'default')
  assert.equal(options.titleBarOverlay, false)
})

test('window background follows the system appearance before content loads', () => {
  assert.equal(createWindowOptions('darwin', false).backgroundColor, '#ffffff')
  assert.equal(createWindowOptions('darwin', true).backgroundColor, '#151517')
})
