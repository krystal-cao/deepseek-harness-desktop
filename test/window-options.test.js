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

test('non-macOS window background follows the system appearance before content loads', () => {
  assert.equal(createWindowOptions('linux', false).backgroundColor, '#ffffff')
  assert.equal(createWindowOptions('linux', true).backgroundColor, '#151517')
})

test('main window hardens the renderer and mounts the bridge preload', () => {
  const options = createWindowOptions('darwin')
  assert.equal(options.webPreferences.contextIsolation, true)
  assert.equal(options.webPreferences.nodeIntegration, false)
  assert.equal(options.webPreferences.sandbox, true)
  assert.match(options.webPreferences.preload, /dsh-bridge-preload\.cjs$/)
})
