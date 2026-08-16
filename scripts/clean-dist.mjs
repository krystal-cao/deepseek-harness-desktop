#!/usr/bin/env node
// Remove the local electron-builder output. Kept out of the release path so
// Finder/Spotlight never indexes a second copy of the app from dist/.
import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
rmSync(dist, { recursive: true, force: true })
console.log(`removed ${dist}`)
