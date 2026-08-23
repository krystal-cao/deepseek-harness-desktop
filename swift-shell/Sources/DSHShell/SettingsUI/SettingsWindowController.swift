import AppKit
import SwiftUI

public final class SettingsWindowController: NSWindowController, NSWindowDelegate {
    public static let shared = SettingsWindowController()
    private static let dragRegionHeight: CGFloat = 120
    private var titleObserver: NSObjectProtocol?
    private var dragOverlay: CustomDragView?

    private init() {
        let hostingController = NSHostingController(rootView: SettingsView())
        let win = NSWindow(contentViewController: hostingController)
        win.title = "通用设置"
        win.titleVisibility = .hidden
        win.titlebarAppearsTransparent = true
        win.styleMask = [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView]
        win.setContentSize(NSSize(width: 900, height: 620))
        win.minSize = NSSize(width: 820, height: 560)
        win.center()
        win.isReleasedWhenClosed = false
        win.isOpaque = false
        win.backgroundColor = .clear
        win.hasShadow = true
        win.isMovableByWindowBackground = true
        if #available(macOS 11.0, *) {
            win.toolbarStyle = .unifiedCompact
            win.titlebarSeparatorStyle = .none
        }

        super.init(window: win)
        win.delegate = self
        if let contentView = win.contentView {
            let drag = CustomDragView(frame: .zero)
            drag.autoresizingMask = [.width, .minYMargin]
            contentView.addSubview(drag, positioned: .above, relativeTo: nil)
            dragOverlay = drag
            layoutDragOverlay()
        }
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
        layoutDragOverlay()
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

    public func windowDidResize(_ notification: Notification) {
        layoutDragOverlay()
    }

    public func windowDidBecomeKey(_ notification: Notification) {
        layoutDragOverlay()
    }

    private func layoutDragOverlay() {
        guard let contentView = window?.contentView, let dragOverlay else { return }
        let height = min(Self.dragRegionHeight, contentView.bounds.height)
        dragOverlay.frame = NSRect(
            x: 0,
            y: contentView.bounds.height - height,
            width: contentView.bounds.width,
            height: height
        )
    }
}
