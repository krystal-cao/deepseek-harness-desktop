import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const PROJECT_SOURCE = fs.readFileSync(
  new URL('../swift-shell/DSH.xcodeproj/project.pbxproj', import.meta.url),
  'utf8',
)
const INFO_PLIST_SOURCE = fs.readFileSync(
  new URL('../swift-shell/Info.plist', import.meta.url),
  'utf8',
)
const VERSION_CONFIG_SOURCE = fs.readFileSync(
  new URL('../swift-shell/Version.xcconfig', import.meta.url),
  'utf8',
)
const BUILD_SOURCE = fs.readFileSync(
  new URL('../swift-shell/build-app.sh', import.meta.url),
  'utf8',
)
const PACKAGE_SOURCE = fs.readFileSync(
  new URL('../swift-shell/package-dmg.sh', import.meta.url),
  'utf8',
)
const FETCH_NODE_SOURCE = fs.readFileSync(
  new URL('../swift-shell/fetch-node.sh', import.meta.url),
  'utf8',
)
const FETCH_PNPM_SOURCE = fs.readFileSync(
  new URL('../swift-shell/fetch-pnpm.sh', import.meta.url),
  'utf8',
)
const SWIFT_PNPM_SOURCE = fs.readFileSync(
  new URL('../swift-shell/assets/bin/pnpm', import.meta.url),
  'utf8',
)

const SWIFT_SOURCES = [
  'main.swift',
  'AppDelegate.swift',
  'ApplicationIcon.swift',
  'State/DshState.swift',
  'Service/NodeRuntime.swift',
  'Versions/DshSemanticVersion.swift',
  'Service/DshService.swift',
  'Versions/DshVersionManager.swift',
  'Plugins/DshPluginManager.swift',
  'Notification/NotificationManager.swift',
  'Bridge/DshBridgeHandler.swift',
  'About/AboutWindowController.swift',
  'MainWindow/MainWindowController.swift',
  'SettingsUI/SettingsViewModel.swift',
  'SettingsUI/VersionsTabView.swift',
  'SettingsUI/PluginsTabView.swift',
  'SettingsUI/GeneralTabView.swift',
  'SettingsUI/AboutTabView.swift',
  'SettingsUI/SettingsView.swift',
  'SettingsUI/SettingsWindowController.swift',
  'Updates/AppUpdateManager.swift',
]

test('Swift shell Xcode project owns the complete native app target', () => {
  assert.match(PROJECT_SOURCE, /productType = "com\.apple\.product-type\.application"/)
  assert.match(PROJECT_SOURCE, /PRODUCT_BUNDLE_IDENTIFIER = "io\.github\.krystal-cao\.dsh-swift-shell"/)
  assert.match(PROJECT_SOURCE, /INFOPLIST_FILE = Info\.plist/)
  assert.match(PROJECT_SOURCE, /app\.icon in Resources/)
  assert.match(PROJECT_SOURCE, /ASSETCATALOG_COMPILER_APPICON_NAME = app/)
  assert.match(PROJECT_SOURCE, /baseConfigurationReference = .*Version\.xcconfig/)
  assert.match(PROJECT_SOURCE, /OTHER_SWIFT_FLAGS = "-parse-as-library"/)
  assert.match(PROJECT_SOURCE, /XCRemoteSwiftPackageReference "Sparkle"/)
  assert.match(PROJECT_SOURCE, /minimumVersion = 2\.9\.3/)
  assert.match(PROJECT_SOURCE, /productName = Sparkle/)
  assert.match(PROJECT_SOURCE, /Copy DSH runtime resources/)
  assert.match(PROJECT_SOURCE, /SWIFT_ASSETS_DIR=\\"\$\{SRCROOT\}\/assets\\"/)
  assert.match(PROJECT_SOURCE, /SWIFT_ASSETS_DIR.*dsh-family\.json/)
  assert.match(PROJECT_SOURCE, /SWIFT_ASSETS_DIR.*node\/bin/)
  assert.match(PROJECT_SOURCE, /SWIFT_ASSETS_DIR.*bin\/pnpm/)
  assert.match(PROJECT_SOURCE, /SWIFT_ASSETS_DIR.*bin\/pnpm-pkg/)
  assert.match(PROJECT_SOURCE, /SWIFT_ASSETS_DIR.*dsh-desktop-host/)
  assert.match(PROJECT_SOURCE, /SRCROOT.*fetch-pnpm\.sh/)
  assert.doesNotMatch(PROJECT_SOURCE, /REPO_DIR.*assets\/bin\/pnpm-pkg/)
  assert.doesNotMatch(PROJECT_SOURCE, /REPO_DIR.*dsh-desktop-host/)
  assert.doesNotMatch(PROJECT_SOURCE, /assets\/bin\/dsh-node/)
  assert.match(PROJECT_SOURCE, /path = Sources;\n\s+sourceTree = "<group>"/)
  assert.doesNotMatch(PROJECT_SOURCE, /name = DSHShell;/)
  assert.match(PROJECT_SOURCE, /path = Info\.plist; sourceTree = "<group>"/)
  assert.doesNotMatch(PROJECT_SOURCE, /path = Sources\/DSHShell\/[^;]+; sourceTree = SOURCE_ROOT/)

  for (const source of SWIFT_SOURCES) {
    const fileName = source.split('/').at(-1)
    assert.match(PROJECT_SOURCE, new RegExp(`path = ${fileName}; sourceTree = "<group>"`))
  }
})

test('Swift build delegates compilation to xcodebuild and keeps the app metadata stable', () => {
  assert.match(BUILD_SOURCE, /xcodebuild/)
  assert.doesNotMatch(BUILD_SOURCE, /swiftc -O/)
  assert.match(BUILD_SOURCE, /SCRIPT_DIR.*fetch-node\.sh/)
  assert.match(BUILD_SOURCE, /SWIFT_BRIDGE_SOURCE=.*dsh-desktop-host/)
  assert.match(FETCH_NODE_SOURCE, /DEST_DIR="\$\{SCRIPT_DIR\}\/assets\/node"/)
  assert.match(FETCH_NODE_SOURCE, /fetch-pnpm\.sh/)
  assert.match(FETCH_PNPM_SOURCE, /pnpm-\$\{PNPM_VERSION\}\.tgz/)
  assert.match(FETCH_PNPM_SOURCE, /shasum -a 512/)
  assert.match(BUILD_SOURCE, /Version\.xcconfig/)
  assert.match(BUILD_SOURCE, /SWIFT_APP_VERSION/)
  assert.match(PACKAGE_SOURCE, /Version\.xcconfig/)
  assert.match(VERSION_CONFIG_SOURCE, /SWIFT_APP_VERSION = 0\.3\.5/)
  assert.doesNotMatch(BUILD_SOURCE, /APP_VERSION[^\n]*package\.json/)
  assert.doesNotMatch(PACKAGE_SOURCE, /package\.json/)
  assert.match(SWIFT_PNPM_SOURCE, /DSH_NODE_BIN/)
  assert.match(SWIFT_PNPM_SOURCE, /pnpm-pkg\/bin\/pnpm\.cjs/)
  assert.doesNotMatch(SWIFT_PNPM_SOURCE, /dsh-node/)
  assert.match(INFO_PLIST_SOURCE, /<string>\$\(PRODUCT_BUNDLE_IDENTIFIER\)<\/string>/)
  assert.match(INFO_PLIST_SOURCE, /<key>CFBundleIconName<\/key>\s*<string>app<\/string>/)
  assert.doesNotMatch(INFO_PLIST_SOURCE, /CFBundleIconFile/)
  assert.match(INFO_PLIST_SOURCE, /<string>\$\(MACOSX_DEPLOYMENT_TARGET\)<\/string>/)
  assert.match(INFO_PLIST_SOURCE, /<key>SUEnableAutomaticChecks<\/key>\s*<true\/>/)
  assert.match(INFO_PLIST_SOURCE, /<key>SUFeedURL<\/key>\s*<string>https:\/\/raw\.githubusercontent\.com\//)
  assert.match(INFO_PLIST_SOURCE, /<key>SUPublicEDKey<\/key>\s*<string>[A-Za-z0-9+/=]+<\/string>/)
  assert.match(INFO_PLIST_SOURCE, /<key>SUVerifyUpdateBeforeExtraction<\/key>\s*<true\/>/)
  assert.match(BUILD_SOURCE, /SWIFT_APP_BUILD/)
})
