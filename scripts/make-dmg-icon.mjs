import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const whalePath = 'M23.0584 4.95203C22.8129 4.83203 22.7074 5.06103 22.5639 5.17704C22.5149 5.21454 22.4734 5.26354 22.4319 5.30854C22.0734 5.69155 21.6543 5.94306 21.1073 5.91306C20.3073 5.86806 19.6243 6.11957 19.0203 6.73158C18.8918 5.97706 18.4652 5.52655 17.8162 5.23754C17.4767 5.08753 17.1332 4.93703 16.8952 4.61052C16.7292 4.37801 16.6837 4.11901 16.6007 3.8635C16.5477 3.70949 16.4952 3.55199 16.3177 3.52549C16.1252 3.49549 16.0497 3.65699 15.9742 3.792C15.6722 4.34401 15.5552 4.95203 15.5667 5.56805C15.5932 6.95359 16.1782 8.05712 17.3407 8.84215C17.4727 8.93215 17.5067 9.02215 17.4652 9.15366C17.3857 9.42416 17.2917 9.68667 17.2087 9.95718C17.1557 10.1297 17.0767 10.1677 16.8917 10.0922C16.2537 9.82568 15.7027 9.43117 15.2156 8.95465C14.3891 8.15513 13.6416 7.2726 12.7096 6.58158C12.4906 6.42007 12.2716 6.27007 12.045 6.12707C11.094 5.20354 12.1696 4.44502 12.4186 4.35501C12.6791 4.26101 12.5091 3.938 11.6675 3.942C10.826 3.9455 10.056 4.22751 9.07446 4.60302C8.93096 4.65952 8.77995 4.70052 8.62545 4.73452C7.73492 4.56552 6.80989 4.52802 5.84386 4.63702C4.02481 4.83953 2.57177 5.69955 1.50373 7.1676C0.220694 8.93215 -0.0813148 10.9372 0.288196 13.0283C0.676708 15.2323 1.80174 17.0569 3.53029 18.4834C5.32285 19.9625 7.38741 20.6875 9.74298 20.5485C11.1735 20.466 12.7661 20.2745 14.5626 18.7539C15.0156 18.9795 15.4912 19.0695 16.2797 19.137C16.8872 19.1935 17.4722 19.107 17.9252 19.013C18.6347 18.8629 18.5857 18.2059 18.3292 18.0854C16.2497 17.1169 16.7062 17.5109 16.2912 17.1919C17.3477 15.9419 18.9618 13.7198 19.4598 10.6942C19.5088 10.3602 19.5713 9.88968 19.5638 9.61917C19.5598 9.45417 19.5978 9.39016 19.7863 9.37116C20.3073 9.31116 20.8128 9.16866 21.2773 8.91315C22.6249 8.17713 23.1684 6.96809 23.2964 5.51905C23.3154 5.29754 23.2924 5.06853 23.0584 4.95203ZM11.3165 17.9954C9.30097 16.4109 8.32344 15.8894 7.91992 15.9119C7.54241 15.9344 7.61042 16.3664 7.69342 16.6479C7.78042 16.9259 7.89342 17.1174 8.05193 17.3614C8.16143 17.5229 8.23694 17.7629 7.94243 17.9434C7.29341 18.3449 6.16487 17.8084 6.11187 17.7819C4.79833 17.0084 3.7003 15.9874 2.92628 14.5908C2.17875 13.2468 1.74474 11.8047 1.67324 10.2657C1.65424 9.89418 1.76374 9.76267 2.13375 9.69517C2.62077 9.60517 3.12278 9.58617 3.6093 9.65767C5.66636 9.95818 7.41741 10.8777 8.88545 12.3348C9.72348 13.1643 10.3575 14.1558 11.0105 15.1243C11.705 16.1529 12.4521 17.1329 13.4036 17.9364C13.7396 18.2179 14.0076 18.4319 14.2641 18.5899C13.4906 18.6764 12.1996 18.6949 11.3165 17.9964V17.9954ZM12.2826 11.7817C12.2826 11.6167 12.4146 11.4852 12.5806 11.4852C12.6181 11.4852 12.6521 11.4927 12.6826 11.5037C12.7241 11.5187 12.7621 11.5412 12.7921 11.5752C12.8451 11.6277 12.8751 11.7027 12.8751 11.7817C12.8751 11.9467 12.7431 12.0782 12.5771 12.0782C12.4111 12.0782 12.2826 11.9467 12.2826 11.7817ZM15.2831 13.3208C15.0906 13.3998 14.8981 13.4673 14.7131 13.4748C14.4261 13.4898 14.1131 13.3733 13.9431 13.2308C13.6791 13.0093 13.4901 12.8853 13.4111 12.4988C13.3771 12.3338 13.3961 12.0782 13.4261 11.9317C13.4941 11.6162 13.4186 11.4137 13.1961 11.2297C13.0151 11.0797 12.7846 11.0382 12.5316 11.0382C12.4371 11.0382 12.3506 10.9967 12.2861 10.9632C12.1806 10.9107 12.0936 10.7792 12.1766 10.6177C12.2031 10.5652 12.3316 10.4377 12.3616 10.4152C12.7051 10.2197 13.1011 10.2837 13.4676 10.4302C13.8071 10.5692 14.0641 10.8242 14.4336 11.1847C14.8111 11.6202 14.8791 11.7402 15.0941 12.0672C15.2641 12.3228 15.4186 12.5853 15.5247 12.8858C15.5887 13.0733 15.5057 13.2268 15.2831 13.3208Z'

// Clean Apple White Hard Drive style SVG
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <!-- Multi-stage drop shadow for physical realism -->
    <filter id="driveShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="28" stdDeviation="32" flood-color="#000000" flood-opacity="0.25"/>
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.14"/>
    </filter>

    <!-- Metallic enclosure gradient -->
    <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="8%" stop-color="#f4f6f8"/>
      <stop offset="82%" stop-color="#e8ebf0"/>
      <stop offset="100%" stop-color="#d4d8de"/>
    </linearGradient>

    <!-- Outer rim / bevel stroke -->
    <linearGradient id="strokeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#c6ccd4"/>
      <stop offset="100%" stop-color="#8e96a0"/>
    </linearGradient>

    <!-- Top highlight reflection -->
    <linearGradient id="topReflect" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>

    <!-- Logo watermark / etched gradient -->
    <linearGradient id="whaleGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#888f98"/>
      <stop offset="100%" stop-color="#a2a9b2"/>
    </linearGradient>

    <filter id="etchedShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="2" stdDeviation="1.2" flood-color="#ffffff" flood-opacity="0.9"/>
    </filter>
  </defs>

  <!-- Drive body -->
  <g filter="url(#driveShadow)">
    <!-- Base Drive Chassis -->
    <rect x="232" y="112" width="560" height="800" rx="56" ry="56" fill="url(#bodyGrad)" stroke="url(#strokeGrad)" stroke-width="4"/>

    <!-- Top gloss reflection -->
    <rect x="236" y="116" width="552" height="180" rx="52" ry="52" fill="url(#topReflect)"/>

    <!-- Bottom bevel separator line -->
    <path d="M 232 830 Q 232 912 288 912 L 736 912 Q 792 912 792 830" fill="none" stroke="#b4bac2" stroke-width="3"/>

    <!-- Status LED indicator pinhole -->
    <circle cx="724" cy="850" r="7.5" fill="#9da4ac" stroke="#7a818a" stroke-width="1.2"/>
    <circle cx="724" cy="849.5" r="3.5" fill="#e8edf2"/>
  </g>

  <!-- DSH Whale Logo Etched in Center -->
  <g transform="translate(512, 470) scale(14.2) translate(-11.6, -11.6)" filter="url(#etchedShadow)">
    <path d="${whalePath}" fill="url(#whaleGrad)"/>
  </g>
</svg>`

const helperRunner = `
const { app, BrowserWindow } = require('electron')
const fs = require('fs')

app.commandLine.appendSwitch('disable-gpu')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
    backgroundColor: '#00000000'
  })

  const html = \`<!DOCTYPE html><html><body style="margin:0;padding:0;background:transparent;overflow:hidden;"><img src="data:image/svg+xml;base64,\${Buffer.from(process.env.SVG_DATA).toString('base64')}" width="1024" height="1024"/></body></html>\`
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise(r => setTimeout(r, 600))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  fs.writeFileSync(process.env.TARGET_PNG, img.toPNG())
  app.quit()
})
`

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-dmg-icon-'))
const helperFile = path.join(tempDir, 'render.cjs')
fs.writeFileSync(helperFile, helperRunner)
const masterPng = path.join(tempDir, 'master.png')

const electronBin = path.join(rootDir, 'node_modules', '.bin', 'electron')

console.log('Rendering DMG icon PNG with Electron...')
execFileSync(electronBin, [helperFile], {
  env: {
    ...process.env,
    SVG_DATA: svg,
    TARGET_PNG: masterPng,
  },
})

console.log('Generating iconset sizes...')
const iconsetDir = path.join(tempDir, 'icon.iconset')
fs.mkdirSync(iconsetDir, { recursive: true })

const sizes = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
]

for (const [name, size] of sizes) {
  execFileSync('sips', ['-z', String(size), String(size), masterPng, '--out', path.join(iconsetDir, name)], {
    stdio: 'ignore',
  })
}

const assetsDir = path.join(rootDir, 'assets')
const outIcns = path.join(assetsDir, 'dmg-icon.icns')
const outPng = path.join(assetsDir, 'dmg-icon.png')

execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', outIcns])
fs.copyFileSync(masterPng, outPng)

console.log('Generated:', outIcns)
console.log('Generated:', outPng)
fs.rmSync(tempDir, { recursive: true, force: true })
