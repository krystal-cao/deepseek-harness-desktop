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
  assert.deepEqual(manifest.dsh.client.inject, ['theme', 'sessions'])
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
  assert.match(client, /inject: \["theme", "sessions"\]/)
  assert.match(client, /ctx\.on\("theme\/change"/)
  assert.match(client, /theme\.getTheme\(\)/)
  assert.match(client, /host\.ready\(\)/)
  assert.match(client, /host\.theme\(/)
  // Task-completion bridge: subscribe to the sessions list store and detect
  // the running→idle edge, reporting through the notify channel.
  assert.match(client, /ctx\.sessions && ctx\.sessions\.list/)
  assert.match(client, /list\.subscribe\(onSnapshot\)/)
  assert.match(client, /running === true/)
  assert.match(client, /host\.notify\(/)
})
