export const MAC_TITLEBAR_HEIGHT = 40

// Reserve the macOS traffic-light strip inside the sidebar and restore the
// native window drag affordance removed by the frameless hiddenInset shell.
// The shipped harness frontend is unaware of the desktop chrome, so its logo
// row would otherwise sit under the close/minimize/zoom buttons and the empty
// top edge would not move the window. The layout column uses css-module
// hashed class names; the substring attribute selector keeps working across
// hash changes (verified live: pI_x6G_sidebarCol).
export const MAC_TITLEBAR_CSS = `
body {
  background: transparent !important;
}

[class*="sidebarCol"] {
  padding-top: ${MAC_TITLEBAR_HEIGHT}px !important;
  background: color-mix(in srgb, var(--dsw-specific-sidebar-fill) 72%, transparent) !important;
}

/* The sidebar's inner root paints an opaque surface over most of the column;
   let the translucent column and the window vibrancy show through. */
[class*="sidebarCol"] [class*="_root"] {
  background: transparent !important;
}

/* The AppFrame is the direct parent of the sidebar column; :has keeps this
   away from unrelated classes whose names also contain "frame". */
[class*="frame"]:has(> [class*="sidebarCol"]) {
  background: transparent !important;
}

[class*="centerCol"],
[class*="detailsCol"] {
  background: var(--dsw-alias-bg-base) !important;
}

body::before {
  content: "";
  position: fixed;
  inset: 0 0 auto;
  height: ${MAC_TITLEBAR_HEIGHT}px;
  -webkit-app-region: drag;
  app-region: drag;
}

a,
button,
input,
textarea,
select,
[role="button"],
[contenteditable]:not([contenteditable="false"]) {
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
`

export async function applyMacTitleBarStyle(webContents) {
  await webContents.insertCSS(MAC_TITLEBAR_CSS)
}
