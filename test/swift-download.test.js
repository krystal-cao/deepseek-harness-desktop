import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const MAIN_WINDOW_SOURCE = fs.readFileSync(
  new URL('../swift-shell/Sources/MainWindow/MainWindowController.swift', import.meta.url),
  'utf8',
)

test('Swift shell converts local attachment navigations into WKDownloads', () => {
  assert.match(MAIN_WINDOW_SOURCE, /WKDownloadDelegate/)
  assert.match(MAIN_WINDOW_SOURCE, /navigationAction\.shouldPerformDownload/)
  assert.match(MAIN_WINDOW_SOURCE, /contentDisposition\?\.contains\("attachment"\)/)
  assert.match(MAIN_WINDOW_SOURCE, /!navigationResponse\.canShowMIMEType/)
  assert.match(MAIN_WINDOW_SOURCE, /decisionHandler\(\.download\)/)
  assert.equal((MAIN_WINDOW_SOURCE.match(/download\.delegate = self/g) ?? []).length, 2)
})

test('Swift downloads open a native save panel with Downloads as the default location', () => {
  assert.match(MAIN_WINDOW_SOURCE, /urls\(for: \.downloadsDirectory, in: \.userDomainMask\)/)
  assert.match(MAIN_WINDOW_SOURCE, /let panel = NSSavePanel\(\)/)
  assert.match(MAIN_WINDOW_SOURCE, /panel\.directoryURL = defaults\.directory/)
  assert.match(MAIN_WINDOW_SOURCE, /panel\.nameFieldStringValue = defaults\.filename/)
  assert.match(MAIN_WINDOW_SOURCE, /panel\.beginSheetModal\(for: window\)/)
  assert.match(MAIN_WINDOW_SOURCE, /guard response == \.OK, let destination = panel\.url/)
  assert.match(MAIN_WINDOW_SOURCE, /downloadDestinations\[ObjectIdentifier\(download\)\]/)
})

test('Swift downloads show their destination and reveal completed files in Finder', () => {
  assert.match(MAIN_WINDOW_SOURCE, /statusLabel\.stringValue = completed \? "下载完成" : "正在下载"/)
  assert.match(MAIN_WINDOW_SOURCE, /pathLabel\.stringValue =/)
  assert.match(MAIN_WINDOW_SOURCE, /showDownloadStatus\(destination: destination, completed: false\)/)
  assert.match(MAIN_WINDOW_SOURCE, /showDownloadStatus\(destination: destination, completed: true\)/)
  assert.match(MAIN_WINDOW_SOURCE, /activateFileViewerSelecting\(\[destination\]\)/)
})

test('Swift ignores only expected navigation cancellation and download policy changes', () => {
  assert.match(MAIN_WINDOW_SOURCE, /NSURLErrorCancelled/)
  assert.match(MAIN_WINDOW_SOURCE, /error\.domain == "WebKitErrorDomain" && error\.code == 102/)
  assert.equal((MAIN_WINDOW_SOURCE.match(/isExpectedNavigationInterruption\(error\)/g) ?? []).length, 3)
})
