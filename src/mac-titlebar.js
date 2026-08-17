export const MAC_TITLEBAR_HEIGHT = 40

// Reserve the macOS traffic-light strip inside the sidebar and restore the
// native window drag affordance removed by the frameless hiddenInset shell.
// The shipped harness frontend is unaware of the desktop chrome, so its logo
// row would otherwise sit under the close/minimize/zoom buttons and the empty
// top edge would not move the window. The layout column uses css-module
// hashed class names; the substring attribute selector keeps working across
// hash changes (verified live: pI_x6G_sidebarCol).
export const MAC_TITLEBAR_CSS = `
[class*="sidebarCol"] {
  padding-top: ${MAC_TITLEBAR_HEIGHT}px !important;
  /* Collapsed (56px) is narrower than the traffic-light strip. Measured via
     the accessibility API: the three 16px lights span x 15..77 with position
     {16,18}, so 88px keeps the whole strip on the dark sidebar with margin. */
  min-width: 88px !important;
  /* Sidebar vibrancy: the column's fill becomes 70% translucent so the native
     'sidebar' material (window vibrancy) shows through. The tint still follows
     the dsh light/dark theme because it reuses the same design token. */
  background: color-mix(in srgb, var(--dsw-specific-sidebar-fill) 70%, transparent) !important;
}

/* The app shell is a CSS grid whose first track is hardcoded to 56px when the
   sidebar is collapsed (inline style, upstream JS constant). The sidebar
   overflows that track and its right side gets covered by the content column,
   so the visible strip stays 56px and the traffic lights stick out. Widen the
   first track to match the min-width above while collapsed. The collapsed
   state is detected through the stable "data-sidebar-collapsed" attribute the
   frame emits (verified in dsh-client-ui-layout), not a hashed class. */
[data-sidebar-collapsed] {
  grid-template-columns: 88px minmax(0px, 1fr) 0px !important;
}

/* The sidebar glass needs every layer that paints an opaque surface cleared:
   html/body and the AppFrame paint --dsw-alias-bg-base over the whole window,
   and the sidebar's inner root paints the sidebar fill again at height:100%.
   The content columns get the opaque base back so only the sidebar is glassy.
   The inner layers are matched by substring (hash-proof, like the selectors
   above): the sidebar root is ..._root, the session list root is ..._root, and
   the bottom fade gradient paints the opaque fill unless re-tinted. */
html,
body {
  background: transparent !important;
}

[class*="frame"]:has(> [class*="sidebarCol"]) {
  background: transparent !important;
}

[class*="centerCol"],
[class*="detailsCol"] {
  background: var(--dsw-alias-bg-base) !important;
}

[class*="sidebarCol"] [class*="_root"],
[class*="sidebarCol"] [class*="listArea"] {
  background: transparent !important;
}

/* The footer stack (footer actions + settings button) and the session-list
   bottom fade must not paint their own tint on top of the glass, otherwise
   the bottom block reads darker than the rest of the sidebar and looks like a
   divider. Force them fully transparent so only the column's 70% fill shows. */
[class*="sidebarCol"] [class*="footArea"],
[class*="sidebarCol"] [class*="footerActions"],
[class*="sidebarCol"] [class*="settingsArea"],
[class*="sidebarCol"] [class*="fade"] {
  background: transparent !important;
}

/* The collapsed rail keeps its icon buttons flush left inside an 88px strip;
   center the logo row and the nav icons so they line up with the lights. */
[class*="railIn"] [class*="iconButton"],
[class*="railIn"] [class*="newSession"],
[class*="railIn"] [class*="searchButton"],
[class*="railIn"] [class*="headerActions"],
[class*="railIn"] [class*="search"] {
  margin-left: auto !important;
  margin-right: auto !important;
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
