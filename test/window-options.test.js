import assert from 'node:assert/strict'
import test from 'node:test'
import { createWindowOptions } from '../src/window-options.js'

test('macOS uses an immersive window with a positioned traffic-light strip', () => {
  const options = createWindowOptions('darwin')

  assert.equal(options.titleBarStyle, 'hiddenInset')
  assert.equal(options.titleBarOverlay, undefined)
  assert.deepEqual(options.trafficLightPosition, { x: 16, y: 18 })
  assert.equal(options.backgroundColor, '#ffffff')
})

test('Windows keeps the menu bar hidden', () => {
  const options = createWindowOptions('win32')

  assert.equal(options.autoHideMenuBar, true)
  assert.equal(options.titleBarStyle, 'default')
  assert.equal(options.titleBarOverlay, false)
})

test('non-macOS window background follows the system appearance before content loads', () => {
  assert.equal(createWindowOptions('linux', false).backgroundColor, '#ffffff')
  assert.equal(createWindowOptions('linux', true).backgroundColor, '#151517')
})
