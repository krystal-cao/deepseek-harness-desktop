import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const ICON_SOURCE = fs.readFileSync(
  new URL('../swift-shell/Sources/ApplicationIcon.swift', import.meta.url),
  'utf8',
)
const ABOUT_WINDOW_SOURCE = fs.readFileSync(
  new URL('../swift-shell/Sources/About/AboutWindowController.swift', import.meta.url),
  'utf8',
)
const ABOUT_TAB_SOURCE = fs.readFileSync(
  new URL('../swift-shell/Sources/SettingsUI/AboutTabView.swift', import.meta.url),
  'utf8',
)
const PROJECT_SOURCE = fs.readFileSync(
  new URL('../swift-shell/DSH.xcodeproj/project.pbxproj', import.meta.url),
  'utf8',
)
const BUILD_SOURCE = fs.readFileSync(
  new URL('../swift-shell/build-app.sh', import.meta.url),
  'utf8',
)
const ICON_COMPOSER_SOURCE = fs.readFileSync(
  new URL('../swift-shell/app.icon/icon.json', import.meta.url),
  'utf8',
)
const ICON_COMPOSER_IMAGE = new URL('../swift-shell/app.icon/Assets/icon-1024.png', import.meta.url)

test('Swift About views load the app icon from the Icon Composer bundle', () => {
  assert.match(ICON_SOURCE, /NSApplication\.shared\.applicationIconImage/)
  assert.match(ICON_SOURCE, /bundledIcon\.isValid/)
  assert.match(ICON_SOURCE, /bundledIcon\.representations\.contains/)
  assert.doesNotMatch(ICON_SOURCE, /forResource: "DSH"/)
  assert.match(ABOUT_WINDOW_SOURCE, /ApplicationIcon\.image/)
  assert.match(ABOUT_TAB_SOURCE, /ApplicationIcon\.image/)
  assert.match(PROJECT_SOURCE, /ApplicationIcon\.swift in Sources/)
  assert.match(PROJECT_SOURCE, /app\.icon in Resources/)
  assert.match(PROJECT_SOURCE, /lastKnownFileType = folder\.iconcomposer\.icon/)
  assert.match(PROJECT_SOURCE, /ASSETCATALOG_COMPILER_APPICON_NAME = app/)
  assert.doesNotMatch(PROJECT_SOURCE, /assets\/icon\.icns/)
  assert.match(BUILD_SOURCE, /APP_ICON_SOURCE=.*app\.icon/)
  assert.match(BUILD_SOURCE, /APP_ICON_NAME="app"/)
  assert.match(BUILD_SOURCE, /xcodebuild/)
  assert.match(BUILD_SOURCE, /Assets\.car/)
  assert.match(BUILD_SOURCE, /APP_ICON_NAME.*\.icns/)
  assert.doesNotMatch(BUILD_SOURCE, /assets\/icon\.icns/)
})

test('Icon Composer bundle contains a valid macOS source image', () => {
  const icon = JSON.parse(ICON_COMPOSER_SOURCE)
  assert.equal(icon.groups.length, 1)
  assert.equal(icon.groups[0].layers[0]['image-name'], 'icon-1024.png')
  assert.equal(icon['supported-platforms'].squares, 'shared')
  assert.ok(fs.existsSync(ICON_COMPOSER_IMAGE))
})
