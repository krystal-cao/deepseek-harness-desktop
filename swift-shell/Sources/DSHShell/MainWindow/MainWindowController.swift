import AppKit
import WebKit
import SwiftUI

public final class MainWindowController: NSWindowController, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, DshBridgeDelegate {
    public static let shared = MainWindowController()

    private var webView: WKWebView?
    private var vibrancyView: NSVisualEffectView?
    private var dragOverlay: CustomDragView?
    private var bridgeHandler = DshBridgeHandler()
    private var onboardingHostingView: NSView?

    private static let titlebarCSS = """
    [class*="sidebarCol"] {
      padding-top: 40px !important;
      min-width: 88px !important;
      background: color-mix(in srgb, var(--dsw-specific-sidebar-fill) 70%, transparent) !important;
    }
    [data-sidebar-collapsed] {
      grid-template-columns: 88px minmax(0px, 1fr) 0px !important;
    }
    html, body { background: transparent !important; }
    [class*="frame"]:has(> [class*="sidebarCol"]) { background: transparent !important; }
    [class*="centerCol"], [class*="detailsCol"] {
      background: var(--dsw-alias-bg-base) !important;
    }
    [class*="sidebarCol"] [class*="_root"],
    [class*="sidebarCol"] [class*="listArea"] { background: transparent !important; }
    [class*="sidebarCol"] [class*="footArea"],
    [class*="sidebarCol"] [class*="footerActions"],
    [class*="sidebarCol"] [class*="settingsArea"],
    [class*="sidebarCol"] [class*="fade"] { background: transparent !important; }
    [class*="railIn"] [class*="iconButton"],
    [class*="railIn"] [class*="newSession"],
    [class*="railIn"] [class*="searchButton"],
    [class*="railIn"] [class*="headerActions"],
    [class*="railIn"] [class*="search"] {
      margin-left: auto !important;
      margin-right: auto !important;
    }
    """

    private static let hideLoadingCSS = """
    #dsh-plugin-loading-overlay, [class*="pluginLoading"] {
      display: none !important;
    }
    """

    private init() {
        let win = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 960),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        win.title = ""
        win.titleVisibility = .hidden
        win.titlebarAppearsTransparent = true
        win.minSize = NSSize(width: 960, height: 640)
        win.center()
        win.isOpaque = false
        win.backgroundColor = .clear
        win.hasShadow = true
        win.isReleasedWhenClosed = false

        super.init(window: win)
        win.delegate = self
        if let closeButton = win.standardWindowButton(.closeButton) {
            closeButton.target = self
            closeButton.action = #selector(hideMainWindow)
        }
        setupContentView(in: win)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setupContentView(in win: NSWindow) {
        let bounds = win.contentView?.bounds ?? NSRect(x: 0, y: 0, width: 1440, height: 960)

        // 1. Vibrancy sidebar background
        let vibrancy = NSVisualEffectView(frame: bounds)
        vibrancy.material = .sidebar
        vibrancy.blendingMode = .behindWindow
        vibrancy.state = .followsWindowActiveState
        vibrancy.autoresizingMask = [.width, .height]
        self.vibrancyView = vibrancy

        // 2. WKWebView Configuration
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        let userContent = WKUserContentController()
        bridgeHandler.delegate = self
        userContent.add(bridgeHandler, name: "dshDesktop")

        // Pre-inject Bridge API
        let bridgeScript = WKUserScript(
            source: DshBridgeHandler.scriptSource,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        )
        userContent.addUserScript(bridgeScript)

        // Pre-inject CSS styles at document start
        let styleScript = """
        (function() {
          const style = document.createElement('style');
          style.id = 'dsh-shell-styles';
          style.textContent = `\(Self.titlebarCSS)\n\(Self.hideLoadingCSS)`;
          (document.head || document.documentElement).appendChild(style);
        })();
        """
        let cssUserScript = WKUserScript(
            source: styleScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        )
        userContent.addUserScript(cssUserScript)

        config.userContentController = userContent

        let wv = WKWebView(frame: bounds, configuration: config)
        wv.navigationDelegate = self
        wv.uiDelegate = self
        wv.autoresizingMask = [.width, .height]
        wv.setValue(false, forKey: "drawsBackground")
        self.webView = wv

        vibrancy.addSubview(wv)

        // 3. Top Drag Overlay (height 40px)
        let drag = CustomDragView(frame: NSRect(x: 0, y: bounds.height - 40, width: bounds.width, height: 40))
        self.dragOverlay = drag
        vibrancy.addSubview(drag)

        win.contentView = vibrancy
    }

    // MARK: - App Launch & Initialization

    public func launch() {
        let installed = DshVersionManager.shared.listInstalledVersions()
        if installed.isEmpty && DshVersionManager.shared.resolveCurrentEntry() == nil {
            showOnboardingView()
            revealWindow()
        } else {
            // Keep window hidden initially to eliminate gray flash
            startAndLoadDsh()
        }
    }

    public func startAndLoadDsh() {
        hideOnboardingView()
        Task { @MainActor in
            do {
                let url = try await restartDshService()
                print("[MainWindowController] DSH service ready at \(url)")
            } catch {
                print("[MainWindowController] Service start failed:", error)
                self.revealWindow()
                self.showErrorAlert(error.localizedDescription)
            }
        }
    }

    /// Restart the service and wait until the selected runtime is ready. The
    /// settings version switch uses this throwing form so it can restore the
    /// previous selection if the new runtime fails to boot.
    public func restartDshService() async throws -> URL {
        await DshPluginManager.shared.ensureDesktopHostPlugin()
        let url = try await DshService.shared.start()
        self.webView?.load(URLRequest(url: url))
        return url
    }

    public func revealWindow() {
        DispatchQueue.main.async { [weak self] in
            guard let win = self?.window else { return }
            if !win.isVisible {
                win.alphaValue = 0
                win.makeKeyAndOrderFront(nil)
                NSApp.activate(ignoringOtherApps: true)
                NSAnimationContext.runAnimationGroup { ctx in
                    ctx.duration = 0.25
                    win.animator().alphaValue = 1.0
                }
            }
        }
    }

    /// Treat the red traffic-light button as hide, like a utility window. The
    /// application stays alive and can be brought back from the Dock, the app
    /// menu, or applicationShouldHandleReopen.
    public func windowShouldClose(_ sender: NSWindow) -> Bool {
        hideMainWindow()
        return false
    }

    @objc private func hideMainWindow() {
        window?.orderOut(nil)
    }

    public func showMainWindow() {
        revealWindow()
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    public func reloadDsh() {
        guard let currentUrl = webView?.url else {
            startAndLoadDsh()
            return
        }
        webView?.load(URLRequest(url: currentUrl))
    }

    // MARK: - Onboarding View

    private func showOnboardingView() {
        guard let vibrancy = vibrancyView else { return }
        let onboarding = OnboardingView { [weak self] in
            self?.startAndLoadDsh()
        }
        let hosting = NSHostingView(rootView: onboarding)
        hosting.frame = vibrancy.bounds
        hosting.autoresizingMask = [.width, .height]
        vibrancy.addSubview(hosting)
        self.onboardingHostingView = hosting
    }

    private func hideOnboardingView() {
        onboardingHostingView?.removeFromSuperview()
        onboardingHostingView = nil
    }

    private func showErrorAlert(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "DSH 启动失败"
        alert.informativeText = message
        alert.addButton(withTitle: "打开设置")
        alert.addButton(withTitle: "退出")
        let response = alert.runModal()
        if response == .alertFirstButtonReturn {
            SettingsWindowController.shared.show()
        } else {
            NSApp.terminate(nil)
        }
    }

    // MARK: - Styling & Theme Injection

    public func syncUiTheme() {
        let theme = DshStateManager.shared.current.uiTheme
        let serialized = (theme == "claude") ? "\"claude\"" : "\"default\""
        let script = """
        (() => {
          const theme = \(serialized);
          window.__DSH_DESKTOP_UI_THEME__ = theme;
          window.dispatchEvent(new CustomEvent('dsh-desktop-ui-theme-change', { detail: { theme } }));
        })();
        """
        webView?.evaluateJavaScript(script, completionHandler: nil)
    }

    public func syncTranslateCommands() {
        let enabled = DshStateManager.shared.current.translateCommands ? "true" : "false"
        let script = """
        (() => {
          const enabled = \(enabled);
          window.__DSH_DESKTOP_TRANSLATE_COMMANDS__ = enabled;
          window.dispatchEvent(new CustomEvent('dsh-desktop-translate-commands-change', { detail: { enabled } }));
        })();
        """
        webView?.evaluateJavaScript(script, completionHandler: nil)
    }

    // MARK: - WKNavigationDelegate

    public func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        if url.host == "127.0.0.1" || url.host == "localhost" {
            decisionHandler(.allow)
        } else {
            if navigationAction.navigationType == .linkActivated {
                NSWorkspace.shared.open(url)
            }
            decisionHandler(.cancel)
        }
    }

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        syncUiTheme()
        syncTranslateCommands()
        revealWindow()
    }

    public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        revealWindow()
        showErrorAlert("页面加载失败：\(error.localizedDescription)")
    }

    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        revealWindow()
        showErrorAlert("页面加载失败：\(error.localizedDescription)")
    }

    // MARK: - WKUIDelegate

    public func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                        for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    // MARK: - DshBridgeDelegate

    public func bridgeDidReceiveReady() {
        print("[MainWindowController] DSH Web plugins ready")
        syncUiTheme()
        syncTranslateCommands()
        revealWindow()
    }

    public func bridgeDidReceiveTheme(colorScheme: String?, externalTheme: String?) {}
    public func bridgeDidReceiveLocale(language: String) {}
}

// MARK: - Onboarding View Model & View

@MainActor
final class OnboardingViewModel: ObservableObject {
    @Published var statusText = "首次启动，正在准备 DSH 运行时..."
    @Published var detailText = ""
    @Published var isInstalling = false
    @Published var selectedRegistry = DshStateManager.shared.current.npmRegistry ?? DshVersionManager.defaultRegistry
    @Published var errorMessage: String?

    func startInitialInstall(onFinished: @escaping () -> Void) {
        isInstalling = true
        errorMessage = nil
        let registry = selectedRegistry
        DshStateManager.shared.update { $0.npmRegistry = registry }

        Task { [self] in
            do {
                let catalog = try await DshVersionManager.shared.fetchCatalog(registry: registry)
                guard let latest = catalog.latest ?? catalog.versions.first?.version else {
                    throw NSError(domain: "Onboarding", code: -1, userInfo: [NSLocalizedDescriptionKey: "未能获取到最新版本号"])
                }

                await MainActor.run {
                    self.statusText = "正在下载 DSH \(latest)..."
                }

                _ = try await DshVersionManager.shared.installVersion(version: latest, registry: registry) { progress in
                    Task { @MainActor in
                        self.statusText = progress.phase
                        self.detailText = progress.detail ?? ""
                    }
                }

                await MainActor.run {
                    onFinished()
                }
            } catch {
                await MainActor.run {
                    self.isInstalling = false
                    self.errorMessage = error.localizedDescription
                }
            }
        }
    }
}

struct OnboardingView: View {
    let onFinished: () -> Void
    @ObservedObject private var vm = OnboardingViewModel()

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "cube.transparent")
                .resizable()
                .scaledToFit()
                .frame(width: 64, height: 64)
                .foregroundColor(.accentColor)

            VStack(spacing: 8) {
                Text("欢迎使用 DeepSeek Harness")
                    .font(.title2)
                    .fontWeight(.bold)
                Text("正在配置运行环境与下载最新版本的 DSH")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            if vm.isInstalling {
                VStack(spacing: 12) {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle())
                        .scaleEffect(1.2)
                    Text(vm.statusText)
                        .font(.body)
                    if !vm.detailText.isEmpty {
                        Text(vm.detailText)
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .lineLimit(2)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding()
                .frame(maxWidth: 400)
            } else {
                VStack(alignment: .leading, spacing: 16) {
                    Picker("下载镜像源：", selection: Binding(
                        get: { vm.selectedRegistry },
                        set: { vm.selectedRegistry = $0 }
                    )) {
                        Text("官方 npm (registry.npmjs.org)").tag(DshVersionManager.defaultRegistry)
                        Text("淘宝镜像 (registry.npmmirror.com)").tag(DshVersionManager.mirrorRegistry)
                    }
                    .pickerStyle(RadioGroupPickerStyle())

                    if let err = vm.errorMessage {
                        Text(err)
                            .font(.caption)
                            .foregroundColor(.red)
                    }

                    Button(action: {
                        vm.startInitialInstall(onFinished: onFinished)
                    }) {
                        HStack {
                            Spacer()
                            Text("开始准备并启动")
                                .fontWeight(.medium)
                            Spacer()
                        }
                        .padding(.vertical, 6)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                }
                .padding(24)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .windowBackgroundColor).opacity(0.8)))
                .frame(maxWidth: 420)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.ultraThinMaterial)
    }
}
