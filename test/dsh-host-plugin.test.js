import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = fileURLToPath(new URL('../assets/dsh-desktop-host', import.meta.url))

test('desktop host bundle declares a web client half and its patch', () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert.equal(manifest.name, 'dsh-desktop-host')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.equal(manifest.dsh.client.immediately, true)
  assert.deepEqual(manifest.dsh.client.inject, ['theme', 'sessions', 'commandUi', 'locale'])
  assert.equal(manifest.exports['.'], './index.js')
  assert.equal(manifest.exports['./client'], './client.js')
  const host = readFileSync(path.join(ROOT, 'index.js'), 'utf8')
  assert.match(host, /export function apply\(\) \{\}/)
})

test('desktop host patch inserts the plugin into the web profile roster', () => {
  const patch = readFileSync(path.join(ROOT, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /- insert:/)
  assert.match(patch, /- id: desktop-host/)
  assert.match(patch, /name: dsh-desktop-host/)
})

test('client bundle registers a factory with the module loader', () => {
  const client = readFileSync(path.join(ROOT, 'client.js'), 'utf8')
  assert.match(client, /window\.__ModuleLoader__\.load\(\{/)
  assert.match(client, /id: "dsh-desktop-host"/)
  assert.match(client, /inject: \["theme", "sessions", "commandUi", "locale"\]/)
  assert.match(client, /ctx\.on\("locale\/change"/)
  assert.match(client, /host\.locale\(/)
  assert.match(client, /ctx\.on\("theme\/change"/)
  assert.match(client, /theme\.getTheme\(\)/)
  assert.match(client, /host\.ready\(\)/)
  assert.match(client, /host\.theme\(/)
  assert.match(client, /theme\.overrideTokens\("dsh-desktop-claude", CLAUDE_THEME_TOKENS\)/)
  assert.match(client, /window\.__DSH_DESKTOP_UI_THEME__/)
  assert.match(client, /dsh-desktop-ui-theme-change/)
  assert.match(client, /value === "claude" \? "claude" : "default"/)
  assert.match(client, /window\.removeEventListener\("dsh-desktop-ui-theme-change"/)
  assert.match(client, /"--dsw-alias-bg-base": \{ light: "#FAF9F5", dark: "#1F1E1D" \}/)
  assert.match(client, /"--dsw-alias-brand-primary": \{ light: "#D97757", dark: "#E08B6D" \}/)
  assert.match(client, /"--dsw-alias-label-primary": \{ light: "#262624", dark: "#ECEBE6" \}/)
  assert.match(client, /"--dsw-specific-sidebar-fill": \{ light: "#F0EEE5", dark: "#262624" \}/)
  assert.match(client, /svg\[class\*=\\\"heroGlow\\\"\] ellipse/)
  assert.match(client, /fill: var\(--dsw-alias-brand-primary\)/)
  assert.match(client, /fill-opacity: 0\.16/)
  assert.match(client, /function detectExternalTheme\(theme\)/)
  assert.match(client, /src === "dsh-desktop-claude"/)
  assert.match(client, /themes\[j\]\.id !== "light" && themes\[j\]\.id !== "dark"/)
  assert.match(client, /externalTheme: external/)
  assert.match(client, /if \(hasExternal\) return/)
  assert.match(client, /offTokens\(\)/)
  assert.doesNotMatch(client, /--ds-chat-font-size|--ds-chat-line-height|font-family|border-radius|font-size/)
  // Task-completion bridge: subscribe to the sessions list store and detect
  // the running→idle edge, reporting through the notify channel.
  assert.match(client, /ctx\.sessions && ctx\.sessions\.list/)
  assert.match(client, /list\.subscribe\(onSnapshot\)/)
  assert.match(client, /running === true/)
  assert.match(client, /host\.notify\(/)
  // Slash command translation bridge:
  assert.match(client, /CHINESE_COMMAND_DESCRIPTIONS/)
  assert.match(client, /compact: "压缩较早的历史会话记录"/)
  assert.match(client, /export: "将当前会话日志下载为 ZIP 压缩包"/)
  assert.match(client, /feedback: "记录针对当前会话的反馈"/)
  assert.match(client, /goal: "设置或查看长期任务的目标"/)
  assert.match(client, /permission: "切换权限预设（沙箱模式 \+ 审批策略）"/)
  assert.match(client, /plan: "进入或退出计划模式"/)
  assert.match(client, /dsh-desktop-translate-commands-change/)
  assert.match(client, /isTranslateCommandsEnabled/)
  assert.match(client, /commandUi\.candidates/)
})
