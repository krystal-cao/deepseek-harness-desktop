import AppKit
import SwiftUI

public final class SettingsWindowController: NSWindowController, NSWindowDelegate {
    public static let shared = SettingsWindowController()
    private var titleObserver: NSObjectProtocol?

    private init() {
        let hostingController = NSHostingController(rootView: SettingsView())
        let win = NSWindow(contentViewController: hostingController)
        win.title = "通用设置"
        win.titleVisibility = .hidden
        win.titlebarAppearsTransparent = false
        win.styleMask = [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView]
        win.setContentSize(NSSize(width: 920, height: 620))
        win.minSize = NSSize(width: 860, height: 560)
        win.center()
        win.isReleasedWhenClosed = false
        win.isOpaque = true
        win.backgroundColor = .windowBackgroundColor
        win.hasShadow = true
        // Let AppKit own the titlebar hit testing. A full-width custom drag
        // layer used to sit above the SwiftUI settings header on macOS 26 and
        // made the top controls feel unresponsive.
        win.isMovableByWindowBackground = false
        if #available(macOS 11.0, *) {
            win.toolbarStyle = .unified
        }

        super.init(window: win)
        win.delegate = self
        titleObserver = NotificationCenter.default.addObserver(
            forName: .dshSettingsPanelDidChange,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let panel = notification.object as? SettingsPanel else { return }
            self?.updateTitle(for: panel.rawValue)
        }
    }

    deinit {
        if let titleObserver {
            NotificationCenter.default.removeObserver(titleObserver)
        }
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    public func show() {
        SettingsViewModel.shared.loadFromState()
        updateTitle(for: SettingsViewModel.shared.selectedCategoryIndex)
        Task {
            await SettingsViewModel.shared.refreshCatalog()
            await SettingsViewModel.shared.followLatestIfEnabled()
            await SettingsViewModel.shared.checkPluginUpdates()
        }
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        // SwiftUI may select the first TextField when the settings window
        // becomes key. Settings should open as a browsing surface instead of
        // immediately entering port-edit mode.
        window?.makeFirstResponder(nil)
        DispatchQueue.main.async { [weak self] in
            self?.window?.makeFirstResponder(nil)
        }
    }

    public func updateTitle(for index: Int) {
        window?.title = SettingsPanel(rawValue: index)?.title ?? "设置"
    }

}
