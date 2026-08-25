// Browser half of the desktop host bridge. This file is served verbatim as a
// classic script (/plugins/dsh-desktop-host/client.js); it only REGISTERS the
// factory, which the client module system materializes when the plugin entry
// activates. Kept dependency-free on purpose.

// Claude's palette from DeepSeek-Code. This deliberately contains only color
// tokens: the DSH Web UI keeps its original text, typography, layout, spacing,
// radius, and component behavior.
var CLAUDE_THEME_TOKENS = {
  "--dsw-alias-bg-base": { light: "#FAF9F5", dark: "#1F1E1D" },
  "--dsw-alias-bg-layer-1": { light: "#F5F4EF", dark: "#2A2927" },
  "--dsw-alias-bg-layer-2": { light: "#F0EEE5", dark: "#30302E" },
  "--dsw-alias-bg-layer-3": { light: "#EBE8DE", dark: "#363430" },
  "--dsw-alias-bg-overlay": { light: "#FFFFFF", dark: "#34322F" },
  "--dsw-alias-bg-module-platform": { light: "#F0EEE5", dark: "#262624" },
  "--dsw-alias-bg-multi-select": { light: "#E5E1D8", dark: "#3B3934" },
  "--dsw-alias-bg-skeleton": { light: "#EFEDE6", dark: "#2E2D2A" },

  "--dsw-alias-border-l1": { light: "#E5E1D8", dark: "#34322E" },
  "--dsw-alias-border-l2": { light: "#D8D3C4", dark: "#3F3E3A" },
  "--dsw-alias-border-l2-darkmode-thin": { light: "#D8D3C4", dark: "#3A3835" },
  "--dsw-alias-border-l3": { light: "#CBC5B4", dark: "#4A4844" },
  "--dsw-alias-border-l4": { light: "#B8B2A0", dark: "#57554F" },
  "--dsw-alias-border-inverted": { light: "#3B3934", dark: "#E5E1D8" },
  "--dsw-alias-border-inverted2": { light: "#262624", dark: "#FAF9F5" },

  "--dsw-alias-brand-primary": { light: "#D97757", dark: "#E08B6D" },
  "--dsw-alias-brand-primary-invert": { light: "#FFFFFF", dark: "#1F1E1D" },
  "--dsw-alias-brand-text": { light: "#C4643F", dark: "#ED9C80" },
  "--dsw-alias-state-business-primary": { light: "#D97757", dark: "#E08B6D" },
  "--dsw-alias-state-business-tertiary": { light: "#F3E0D7", dark: "#4A352C" },

  "--dsw-alias-label-primary": { light: "#262624", dark: "#ECEBE6" },
  "--dsw-alias-label-secondary": { light: "#57534E", dark: "#A8A499" },
  "--dsw-alias-label-tertiary": { light: "#7C7A75", dark: "#8F8B81" },
  "--dsw-alias-label-caption": { light: "#8A877E", dark: "#7E7A70" },
  "--dsw-alias-label-dimmed": { light: "#B5B2A8", dark: "#5F5C54" },
  "--dsw-alias-label-primary-dimmed": { light: "#98958D", dark: "#77736A" },
  "--dsw-alias-label-primary-foreground": { light: "#FFFFFF", dark: "#1F1E1D" },
  "--dsw-alias-label-primary-inverted": { light: "#FAF9F5", dark: "#262624" },
  "--dsw-alias-label-primary-bluish": { light: "#4E5A66", dark: "#B9C4CE" },

  "--dsw-alias-interactive-bg-hover": { light: "#EFECE2", dark: "#312F2B" },
  "--dsw-alias-interactive-bg-active": { light: "#E8E3D5", dark: "#383631" },
  "--dsw-alias-interactive-bg-hover-accent": { light: "#F6E9E3", dark: "#3E3129" },
  "--dsw-alias-interactive-bg-hover-danger": { light: "#F5E3E1", dark: "#42302D" },
  "--dsw-alias-interactive-bg-hover-solid": { light: "#E5E1D8", dark: "#3F3E3A" },

  "--dsw-alias-button-primary-fill": { light: "#D97757", dark: "#E08B6D" },
  "--dsw-alias-button-primary-hover": { light: "#C4643F", dark: "#ED9C80" },
  "--dsw-alias-button-primary-dimmed": { light: "#E8B7A5", dark: "#9C6A52" },
  "--dsw-alias-button-contrast-fill": { light: "#262624", dark: "#FAF9F5" },
  "--dsw-alias-button-elevated-fill": { light: "#FFFFFF", dark: "#30302E" },
  "--dsw-alias-button-floating-fill": { light: "#D97757", dark: "#E08B6D" },
  "--dsw-alias-button-floating-hover": { light: "#C4643F", dark: "#ED9C80" },
  "--dsw-alias-button-ghost-active-border": { light: "#D97757", dark: "#E08B6D" },
  "--dsw-alias-button-ghost-active-fill": { light: "#F6E9E3", dark: "#3E3129" },
  "--dsw-alias-button-ghost-active-hover": { light: "#F0DFD7", dark: "#46372E" },
  "--dsw-alias-button-info-fill": { light: "#D97757", dark: "#E08B6D" },
  "--dsw-alias-button-info-hover": { light: "#C4643F", dark: "#ED9C80" },
  "--dsw-alias-button-tool-bar-fill": { light: "#F0EEE5", dark: "#2A2927" },
  "--dsw-alias-button-tool-bar-fill-invisible": { light: "#FAF9F5", dark: "#1F1E1D" },
  "--dsw-alias-button-tool-bar-hover": { light: "#E5E1D8", dark: "#3F3E3A" },

  "--dsw-alias-state-error-primary": { light: "#BF4D43", dark: "#E08579" },
  "--dsw-alias-state-error-secondary": { light: "#F5E3E1", dark: "#42302D" },
  "--dsw-alias-state-success-primary": { light: "#6A8A5B", dark: "#9DB88D" },
  "--dsw-alias-state-success-secondary": { light: "#E9F0E4", dark: "#2F3A2B" },
  "--dsw-alias-state-success-tertiary": { light: "#D7E4CF", dark: "#3A4734" },
  "--dsw-alias-state-warn-primary": { light: "#C08A3E", dark: "#D9A55E" },
  "--dsw-alias-state-warn-secondary": { light: "#F4EBDD", dark: "#3D3527" },
  "--dsw-alias-state-warn-tertiary": { light: "#EBDCC4", dark: "#453B2A" },
  "--dsw-alias-state-warn-label": { light: "#9A6D2C", dark: "#D9A55E" },

  "--dsw-alias-markdown-code-block": { light: "#F5F4EF", dark: "#262523" },
  "--dsw-alias-markdown-code-block-banner": { light: "#EFEDE6", dark: "#2E2D2A" },
  "--dsw-alias-markdown-inline-code": { light: "#F0EEE5", dark: "#30302E" },
  "--dsw-alias-markdown-code-segment-selected": { light: "#E8D9CF", dark: "#4A352C" },
  "--dsw-alias-markdown-code-segment-unselected": { light: "#EFEDE6", dark: "#2A2927" },
  "--dsw-alias-markdown-citation": { light: "#C4643F", dark: "#ED9C80" },
  "--dsw-alias-markdown-placeholder": { light: "#D8D3C4", dark: "#3F3E3A" },
  "--dsw-alias-markdown-tag": { light: "#8A877E", dark: "#8F8B81" },

  "--dsw-specific-sidebar-fill": { light: "#F0EEE5", dark: "#262624" },
  "--dsw-specific-sidebar-nav-item-hover": { light: "#E9E4D8", dark: "#312F2B" },
  "--dsw-specific-sidebar-nav-item-active": { light: "#E5DFCE", dark: "#3A3730" },
  "--dsw-specific-sidebar-nav-item-active-accent": { light: "#D97757", dark: "#E08B6D" },
  "--dsw-specific-bubble": { light: "#F5F0E8", dark: "#2C2B28" },
  "--dsw-specific-bubble-highlight": { light: "#EFE7D9", dark: "#343230" },
  "--dsw-specific-input-major": { light: "#FFFFFF", dark: "#2A2927" },
  "--dsw-specific-login-input": { light: "#FFFFFF", dark: "#2A2927" },
  "--dsw-specific-menu": { light: "#FBFAF7", dark: "#30302E" },
  "--dsw-specific-selector": { light: "#F5F4EF", dark: "#2A2927" },
  "--dsw-specific-tip": { light: "#F0EEE5", dark: "#2A2927" },

  "--dsw-alias-scrollbar-bg-l1": { light: "#D8D3C4", dark: "#3F3E3A" },
  "--dsw-alias-scrollbar-bg-l2": { light: "#CBC5B4", dark: "#4A4844" },
  "--dsw-alias-scrollbar-hover-l1": { light: "#C4BEAC", dark: "#57554F" },
  "--dsw-alias-scrollbar-hover-l2": { light: "#B8B2A0", dark: "#63615A" },
  "--dsw-alias-toast-bg": { light: "#262624", dark: "#ECEBE6" },
  "--dsw-alias-tooltip-bg": { light: "#262624", dark: "#ECEBE6" },
}

// The hero glow is an SVG presentation attribute in DSH rather than a theme
// token. Override only its color so the original geometry and opacity remain
// untouched. The selector intentionally matches DSH's hashed heroGlow class.
var CLAUDE_THEME_CSS =
  "svg[class*=\"heroGlow\"] ellipse { fill: var(--dsw-alias-brand-primary) !important; fill-opacity: 0.16 !important; }"

function installClaudeThemeCss() {
  if (typeof document === "undefined" || !document.head) return null
  var existing = document.querySelector("style[data-plugin-css=\"dsh-desktop-claude\"]")
  if (existing) {
    return function () {
      if (existing.parentNode) existing.parentNode.removeChild(existing)
    }
  }
  var style = document.createElement("style")
  style.dataset.plugin = "dsh-desktop-host"
  style.dataset.pluginCss = "dsh-desktop-claude"
  style.textContent = CLAUDE_THEME_CSS
  document.head.appendChild(style)
  return function () {
    if (style.parentNode) style.parentNode.removeChild(style)
  }
}
var loadedPluginIds = []
var onModuleLoadedCallbacks = []
if (typeof window !== "undefined") {
  var origModuleLoader = window.__ModuleLoader__
  var hookLoader = function (loader) {
    if (!loader || loader.__dshDesktopHooked) return loader
    var origLoad = loader.load
    loader.load = function (handoff) {
      if (handoff && typeof handoff.id === "string") {
        loadedPluginIds.push(handoff.id)
        for (var i = 0; i < onModuleLoadedCallbacks.length; i++) {
          try {
            onModuleLoadedCallbacks[i](handoff.id)
          } catch (e) {}
        }
      }
      return origLoad ? origLoad.apply(this, arguments) : undefined
    }
    loader.__dshDesktopHooked = true
    return loader
  }
  if (origModuleLoader) {
    hookLoader(origModuleLoader)
  }
}

function detectExternalTheme(theme) {
  // 1. Check Cordis theme service overrides and custom registered themes
  if (theme) {
    if (theme.overrides && typeof theme.overrides.keys === "function") {
      var sources = Array.from(theme.overrides.keys())
      for (var i = 0; i < sources.length; i++) {
        var src = sources[i]
        if (!src || src === "dsh-desktop-claude" || src.indexOf("@deepseek-ai/") === 0) continue
        return src
      }
    }
    var snapshot = theme.getTheme ? theme.getTheme() : null
    var themes = (snapshot && snapshot.themes) || theme.themes || []
    for (var j = 0; j < themes.length; j++) {
      if (themes[j].id !== "light" && themes[j].id !== "dark") return themes[j].id
    }
    if (snapshot && snapshot.preference && snapshot.preference !== "light" && snapshot.preference !== "dark" && snapshot.preference !== "system") {
      return snapshot.preference
    }
  }

  // 2. Check loaded client plugin IDs in window.__ModuleLoader__
  for (var k = 0; k < loadedPluginIds.length; k++) {
    var id = loadedPluginIds[k]
    if (!id || id.indexOf("@deepseek-ai/") === 0) continue
    if (id === "dsh-desktop-host" || id === "dsh-desktop-claude") continue
    if (/theme|skin/i.test(id)) return id
  }

  // 3. Check known skin/theme DOM attributes or custom stylesheets
  if (typeof document !== "undefined") {
    if (document.body && (
      document.body.hasAttribute("data-dsh-deepseek-workshop") ||
      document.body.hasAttribute("data-skin") ||
      document.body.hasAttribute("data-theme")
    )) {
      return "custom-skin"
    }
    if (document.querySelector("[data-skin-chrome], [data-skin], [data-dsh-sidebar-surface]")) {
      return "custom-skin"
    }
    var styles = document.querySelectorAll("style[data-plugin-css]")
    for (var s = 0; s < styles.length; s++) {
      var pluginCss = styles[s].dataset.pluginCss
      if (!pluginCss) continue
      if (pluginCss.indexOf("@deepseek-ai/") === 0) continue
      if (pluginCss === "dsh-desktop-host" || pluginCss === "dsh-desktop-claude") continue
      if (/theme|skin/i.test(pluginCss)) return pluginCss
    }
  }

  return null
}

window.__ModuleLoader__.load({
  id: "dsh-desktop-host",
  factory: function (require) {
    var module = { exports: {} }
    module.exports = {
      inject: ["theme", "sessions", "commandUi", "locale"],
      apply: function (ctx) {
        var host = window.dshDesktop
        if (!host) return undefined
        // `apply` runs while Cordis is still composing the web application.
        // Reporting readiness here races the app's own boot screen and makes
        // native shells reveal a transient "Loading plugins" page. Wait for
        // the rendered UI to replace that screen before notifying the shell.
        var bridgeReadyReported = false
        var bridgeReadyTimer = null
        var reportBridgeReady = function () {
          if (bridgeReadyReported || !host || typeof host.ready !== "function") return
          var body = typeof document !== "undefined" ? document.body : null
          var text = body && typeof body.textContent === "string" ? body.textContent.trim() : ""
          var loading = text.indexOf("Loading plugins") !== -1 || text.indexOf("加载插件") !== -1
          var hasAppShell = !!(document.querySelector(
            '[class*="sidebarCol"], [class*="railIn"], [class*="centerCol"]'
          ))
          if (loading || text.length <= 120 || !hasAppShell) {
            bridgeReadyTimer = window.setTimeout(reportBridgeReady, 50)
            return
          }
          bridgeReadyReported = true
          bridgeReadyTimer = null
          host.ready()
        }

        // --- Locale bridge ---
        var offLocale = null
        var offLocaleSub = null
        try {
          var reportLocale = function (loc) {
            var language = "zh"
            if (typeof loc === "string") {
              language = loc === "en" ? "en" : "zh"
            } else if (loc && typeof loc.active === "string") {
              language = loc.active === "en" ? "en" : "zh"
            } else if (ctx.locale && typeof ctx.locale.getLocale === "function") {
              var snap = ctx.locale.getLocale()
              if (snap && snap.active) language = snap.active === "en" ? "en" : "zh"
            }
            if (host && typeof host.locale === "function") {
              host.locale({ language: language })
            }
          }
          if (ctx.locale) {
            reportLocale(typeof ctx.locale.getLocale === "function" ? ctx.locale.getLocale() : null)
            if (typeof ctx.locale.subscribe === "function") {
              offLocaleSub = ctx.locale.subscribe(function (snap) {
                reportLocale(snap)
              })
            }
          }
          offLocale = ctx.on("locale/change", function (newLocale) {
            reportLocale(newLocale)
          })
        } catch (error) {
          // Best-effort locale bridge.
        }

        // --- Theme bridge ---
        var lastExternalReported = null
        var send = function (snapshot) {
          var external = detectExternalTheme(ctx.theme)
          lastExternalReported = external
          host.theme({
            colorScheme: snapshot && snapshot.active ? snapshot.active.colorScheme : "system",
            preference: snapshot ? snapshot.preference : "system",
            externalTheme: external,
          })
        }
        var offTokens = null
        var offThemeCss = null
        var offTheme = null
        var onUiThemeChange = null
        var lastAppliedTheme = null
        var lastHadExternal = null
        var domObserver = null
        var onModuleLoaded = null
        try {
          var theme = ctx.theme
          var applyUiTheme = function (value) {
            var target = value === "claude" ? "claude" : "default"
            var external = detectExternalTheme(theme)
            var hasExternal = !!external

            if (lastAppliedTheme === target && lastHadExternal === hasExternal) {
              return
            }
            lastAppliedTheme = target
            lastHadExternal = hasExternal

            if (offTokens) {
              try {
                offTokens()
              } catch (error) {
                // Best-effort removal of the previous palette layer.
              }
              offTokens = null
            }
            if (offThemeCss) {
              try {
                offThemeCss()
              } catch (error) {
                // Best-effort removal of the previous hero glow override.
              }
              offThemeCss = null
            }
            if (hasExternal) return
            if (target !== "claude") return
            offThemeCss = installClaudeThemeCss()
            if (theme && typeof theme.overrideTokens === "function") {
              offTokens = theme.overrideTokens("dsh-desktop-claude", CLAUDE_THEME_TOKENS)
            }
          }
          applyUiTheme(window.__DSH_DESKTOP_UI_THEME__)
          onUiThemeChange = function (event) {
            lastAppliedTheme = null
            applyUiTheme(event && event.detail ? event.detail.theme : "default")
          }
          window.addEventListener("dsh-desktop-ui-theme-change", onUiThemeChange)
          offTheme = ctx.on("theme/change", function (snapshot) {
            send(snapshot)
            applyUiTheme(window.__DSH_DESKTOP_UI_THEME__)
          })

          onModuleLoaded = function (modId) {
            if (!modId || modId.indexOf("@deepseek-ai/") === 0) return
            if (modId === "dsh-desktop-host" || modId === "dsh-desktop-claude") return
            if (/theme|skin/i.test(modId)) {
              var snap = theme && typeof theme.getTheme === "function" ? theme.getTheme() : null
              send(snap)
              applyUiTheme(window.__DSH_DESKTOP_UI_THEME__)
            }
          }
          onModuleLoadedCallbacks.push(onModuleLoaded)

          if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
            domObserver = new MutationObserver(function () {
              var ext = detectExternalTheme(theme)
              if (ext !== lastExternalReported) {
                var snap = theme && typeof theme.getTheme === "function" ? theme.getTheme() : null
                send(snap)
                applyUiTheme(window.__DSH_DESKTOP_UI_THEME__)
              }
            })
            domObserver.observe(document.documentElement, {
              childList: true,
              subtree: true,
              attributes: true,
              attributeFilter: ["data-dsh-deepseek-workshop", "data-skin", "data-theme", "data-skin-chrome", "data-dsh-sidebar-surface", "data-plugin-css"],
            })
          }

          if (theme && typeof theme.getTheme === "function") send(theme.getTheme())
        } catch (error) {
          // Best-effort bridge: the UI keeps working without theme sync.
        }

        // --- Task-completion bridge ---
        // The dsh client exposes `ctx.sessions.list` (an observable snapshot
        // store, getSnapshot()+subscribe). We track each session's `running`
        // bit and detect the running→idle edge: that is exactly "an agent task
        // finished". The desktop shell turns this into a system notification
        // when the window is unfocused/hidden.
        var prevRunning = Object.create(null) // sessionId -> running (last seen)
        var offSessions = null
        try {
          var list = ctx.sessions && ctx.sessions.list
          var hasApi = !!(list && typeof list.subscribe === "function" && typeof list.getSnapshot === "function")
          if (hasApi) {
            function onSnapshot() {
              var state = list.getSnapshot() || {}
              var byId = state.byId || {}
              var convo = state.conversations || {}
              var changed = false
              for (var id in byId) {
                if (!Object.prototype.hasOwnProperty.call(byId, id)) continue
                var summary = byId[id]
                var running = summary ? summary.running === true : false
                var prev = prevRunning[id] === true
                if (prev && !running) {
                  // A session that was running just went idle → notify.
                  var title = summary && summary.displayTitle ? summary.displayTitle : null
                  var cwd = summary && summary.cwd ? summary.cwd : null
                  host.notify({ sessionId: id, title: title, cwd: cwd, completedAt: Date.now() })
                  changed = true
                }
                prevRunning[id] = running
              }
              // Prune sessions that disappeared to avoid unbounded growth.
              for (var gone in prevRunning) {
                if (Object.prototype.hasOwnProperty.call(prevRunning, gone) && !byId[gone]) {
                  delete prevRunning[gone]
                }
              }
              return changed
            }
            onSnapshot()
            offSessions = list.subscribe(onSnapshot)
          }
        } catch (error) {
          if (host.debug) host.debug("sessions-subscribe-error " + (error && error.message ? error.message : String(error)))
        }

        // --- Slash command translation bridge ---
        var offCommandUi = null
        var offTranslateCommandsListener = null
        var CHINESE_COMMAND_DESCRIPTIONS = {
          compact: "压缩较早的历史会话记录",
          export: "将当前会话日志下载为 ZIP 压缩包",
          feedback: "记录针对当前会话的反馈",
          goal: "设置或查看长期任务的目标",
          permission: "切换权限预设（沙箱模式 + 审批策略）",
          plan: "进入或退出计划模式",
        }
        function isTranslateCommandsEnabled() {
          return window.__DSH_DESKTOP_TRANSLATE_COMMANDS__ !== false
        }
        function wrapCommandUi(commandUi) {
          if (!commandUi || typeof commandUi.candidates !== "function") return null
          // DSH exposes services through Cordis traceable proxies. Assigning
          // `commandUi.candidates` on that proxy only writes to a shadow
          // object; the slash source still calls the original service
          // instance. Patch the prototype instead so the live instance used
          // by the source sees the wrapper, then restore it on disposal.
          var proto = Object.getPrototypeOf(commandUi)
          var descriptor = proto && Object.getOwnPropertyDescriptor(proto, "candidates")
          if (!descriptor || typeof descriptor.value !== "function") return null
          var origCandidates = descriptor.value
          if (origCandidates.__dshDesktopWrapped__) return null
          var wrappedCandidates = async function (session, req) {
            var rows = await origCandidates.call(this, session, req)
            if (!isTranslateCommandsEnabled() || !Array.isArray(rows)) return rows
            return rows.map(function (row) {
              var zh = row && row.name ? CHINESE_COMMAND_DESCRIPTIONS[row.name] : null
              return zh ? Object.assign({}, row, { description: zh }) : row
            })
          }
          Object.defineProperty(wrappedCandidates, "__dshDesktopWrapped__", { value: true })
          Object.defineProperty(proto, "candidates", Object.assign({}, descriptor, { value: wrappedCandidates }))
          return function unwrap() {
            if (proto.candidates === wrappedCandidates) {
              Object.defineProperty(proto, "candidates", descriptor)
            }
          }
        }

        try {
          if (ctx.commandUi) {
            offCommandUi = wrapCommandUi(ctx.commandUi)
          } else if (typeof ctx.inject === "function") {
            ctx.inject(["commandUi"], function (scope) {
              var cmd = scope.commandUi || (typeof scope.get === "function" ? scope.get("commandUi") : null)
              offCommandUi = wrapCommandUi(cmd)
            })
          }
          var onTranslateCommandsChange = function (event) {
            if (event && event.detail && typeof event.detail.enabled === "boolean") {
              window.__DSH_DESKTOP_TRANSLATE_COMMANDS__ = event.detail.enabled
            }
            var cmd = ctx.commandUi || (typeof ctx.get === "function" ? ctx.get("commandUi") : null)
            if (cmd && cmd.directory && typeof cmd.directory.invalidateAll === "function") {
              cmd.directory.invalidateAll()
            }
          }
          window.addEventListener("dsh-desktop-translate-commands-change", onTranslateCommandsChange)
          offTranslateCommandsListener = function () {
            window.removeEventListener("dsh-desktop-translate-commands-change", onTranslateCommandsChange)
          }
        } catch (error) {
          // Best-effort command translation bridge.
        }

        // All bridge subscriptions are installed before readiness is reported.
        // The native shell still performs its own readiness check as a
        // fallback, but this signal now means the actual web UI is visible.
        reportBridgeReady()

        return function dispose() {
          if (bridgeReadyTimer) {
            window.clearTimeout(bridgeReadyTimer)
            bridgeReadyTimer = null
          }
          if (offTheme) {
            try {
              offTheme()
            } catch (error) {
              // The fiber may already be tearing down; nothing to clean up.
            }
          }
          if (offLocale) {
            try {
              offLocale()
            } catch (error) {}
          }
          if (offLocaleSub) {
            try {
              offLocaleSub()
            } catch (error) {}
          }
          if (onUiThemeChange) {
            try {
              window.removeEventListener("dsh-desktop-ui-theme-change", onUiThemeChange)
            } catch (error) {
              // Best-effort listener cleanup.
            }
          }
          if (offTokens) {
            try {
              offTokens()
            } catch (error) {
              // Best-effort removal of the palette layer.
            }
          }
          if (offThemeCss) {
            try {
              offThemeCss()
            } catch (error) {
              // Best-effort removal of the hero glow color override.
            }
          }
          if (offCommandUi) {
            try {
              offCommandUi()
            } catch (error) {}
          }
          if (offTranslateCommandsListener) {
            try {
              offTranslateCommandsListener()
            } catch (error) {}
          }
          if (offSessions) {
            try {
              offSessions()
            } catch (error) {
              // Best-effort unsubscribe.
            }
          }
          if (domObserver) {
            try {
              domObserver.disconnect()
            } catch (error) {}
            domObserver = null
          }
          if (onModuleLoaded) {
            var idx = onModuleLoadedCallbacks.indexOf(onModuleLoaded)
            if (idx !== -1) onModuleLoadedCallbacks.splice(idx, 1)
          }
        }
      },
    }
    return module.exports
  },
})
