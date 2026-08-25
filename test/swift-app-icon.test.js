import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const ICON_SOURCE = fs.readFileSync(
  new URL('../swift-shell/Sources/DSHShell/ApplicationIcon.swift', import.meta.url),
  'utf8',
)
const ABOUT_WINDOW_SOURCE = fs.readFileSync(
  new URL('../swift-shell/Sources/DSHShell/About/AboutWindowController.swift', import.meta.url),
  'utf8',
)
const ABOUT_TAB_SOURCE = fs.readFileSync(
  new URL('../swift-shell/Sources/DSHShell/SettingsUI/AboutTabView.swift', import.meta.url),
  'utf8',
)
const BUILD_SOURCE = fs.readFileSync(
  new URL('../swift-shell/build-app.sh', import.meta.url),
  'utf8',
)

test('Swift About views load the packaged app icon directly', () => {
  assert.match(ICON_SOURCE, /Bundle\.main\.url\(forResource: "DSH", withExtension: "icns"\)/)
  assert.match(ICON_SOURCE, /NSImage\(contentsOf: iconURL\)/)
  assert.match(ICON_SOURCE, /bundledIcon\.isValid/)
  assert.match(ICON_SOURCE, /bundledIcon\.representations\.contains/)
  assert.match(ABOUT_WINDOW_SOURCE, /ApplicationIcon\.image/)
  assert.match(ABOUT_TAB_SOURCE, /ApplicationIcon\.image/)
  assert.match(BUILD_SOURCE, /Sources\/DSHShell\/ApplicationIcon\.swift/)
})
