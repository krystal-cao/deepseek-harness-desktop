import AppKit
import SwiftUI

public enum SettingsPanel: Int, CaseIterable, Identifiable, Hashable {
    case general = 0
    case versions = 1
    case plugins = 2
    case about = 3

    public var id: Int { rawValue }

    public var title: String {
        switch self {
        case .general: return "通用设置"
        case .versions: return "版本管理"
        case .plugins: return "插件管理"
        case .about: return "关于"
        }
    }

    public var navTitle: String {
        switch self {
        case .general: return "通用"
        case .versions: return "版本"
        case .plugins: return "插件"
        case .about: return "关于"
        }
    }

    public var icon: String {
        switch self {
        case .general: return "gearshape"
        case .versions: return "shippingbox"
        case .plugins: return "puzzlepiece.extension"
        case .about: return "info.circle"
        }
    }
}

/// A grouped settings section matching the native macOS settings hierarchy:
/// the title sits outside a quiet rounded group with inset separators.
struct SettingsSection<Content: View>: View {
    @Environment(\.colorScheme) private var colorScheme

    let title: String
    let footer: String?
    @ViewBuilder let content: () -> Content

    init(
        _ title: String,
        footer: String? = nil,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.title = title
        self.footer = footer
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
                .foregroundStyle(.primary)
                .padding(.leading, 2)

            VStack(spacing: 0) {
                content()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(groupFill)
            }
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(groupStroke, lineWidth: 1)
            }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            if let footer {
                Text(footer)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 2)
            }
        }
    }

    private var groupFill: Color {
        colorScheme == .dark ? Color.white.opacity(0.07) : Color.black.opacity(0.035)
    }

    private var groupStroke: Color {
        colorScheme == .dark ? Color.white.opacity(0.08) : Color.black.opacity(0.035)
    }
}

struct SettingsRow<Accessory: View>: View {
    private let accessoryColumnWidth: CGFloat = 240

    let title: String
    let description: String?
    @ViewBuilder let accessory: () -> Accessory

    init(
        title: String,
        description: String? = nil,
        @ViewBuilder accessory: @escaping () -> Accessory
    ) {
        self.title = title
        self.description = description
        self.accessory = accessory
    }

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(.primary)

                if let description {
                    Text(description)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Spacer(minLength: 14)

            HStack(spacing: 0) {
                Spacer(minLength: 0)
                accessory()
            }
            .frame(width: accessoryColumnWidth)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, description == nil ? 9 : 10)
    }
}

struct SettingsDivider: View {
    var body: some View { Divider().padding(.leading, 18) }
}

public struct SettingsView: View {
    @ObservedObject var viewModel = SettingsViewModel.shared
    @State private var backStack: [SettingsPanel] = []
    @State private var forwardStack: [SettingsPanel] = []

    public init() {}

    public var body: some View {
        settingsSplitView
            .frame(minWidth: 860, minHeight: 560)
            .onAppear {
                // The window controller loads persisted state immediately
                // before showing this already-created SwiftUI hierarchy.
                backStack.removeAll()
                forwardStack.removeAll()
            }
            .alert(item: Binding<SettingsAlertItem?>(
                get: { viewModel.alertMessage.map { SettingsAlertItem(message: $0) } },
                set: { _ in viewModel.alertMessage = nil }
            )) { item in
                Alert(
                    title: Text("提示"),
                    message: Text(item.message),
                    dismissButton: .default(Text("好的"))
                )
            }
    }

    private var currentPanel: SettingsPanel {
        SettingsPanel(rawValue: viewModel.selectedCategoryIndex) ?? .general
    }

    private var selection: Binding<SettingsPanel?> {
        Binding(
            get: { currentPanel },
            set: { panel in
                guard let panel else { return }
                navigate(to: panel)
            }
        )
    }

    @ViewBuilder
    private var settingsSplitView: some View {
        if #available(macOS 26.0, *) {
            NavigationSplitView {
                macOS26Sidebar
            } detail: {
                macOS26Detail
            }
            .navigationSplitViewStyle(.balanced)
            .toolbar(removing: .title)
        } else {
            NavigationSplitView {
                legacySidebar
            } detail: {
                legacyDetail
            }
            .navigationSplitViewStyle(.balanced)
        }
    }

    @available(macOS 26.0, *)
    private var macOS26Sidebar: some View {
        List(SettingsPanel.allCases, selection: selection) { panel in
            Label(panel.navTitle, systemImage: panel.icon)
                .tag(panel)
        }
        .listStyle(.sidebar)
        .navigationSplitViewColumnWidth(min: 230, ideal: 250, max: 270)
        .toolbar(removing: .sidebarToggle)
    }

    private var legacySidebar: some View {
        List(SettingsPanel.allCases, selection: selection) { panel in
            Label(panel.navTitle, systemImage: panel.icon)
                .tag(panel)
        }
        .listStyle(.sidebar)
        .navigationSplitViewColumnWidth(min: 230, ideal: 250, max: 270)
    }

    private var detailContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                switch currentPanel {
                case .general:
                    GeneralTabView()
                case .versions:
                    VersionsTabView()
                case .plugins:
                    PluginsTabView()
                case .about:
                    AboutTabView()
                }
            }
            .padding(.top, 18)
            .padding(.bottom, 24)
            .padding(.horizontal, 20)
            .frame(maxWidth: 860, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollIndicators(.visible)
    }

    @available(macOS 26.0, *)
    private var macOS26Detail: some View {
        detailContent
            .scrollEdgeEffectStyle(.soft, for: .top)
            .toolbar(removing: .title)
            .toolbar { macOS26Toolbar }
    }

    private var legacyDetail: some View {
        detailContent
            .toolbar { legacyToolbar }
    }

    @ToolbarContentBuilder
    @available(macOS 26.0, *)
    private var macOS26Toolbar: some ToolbarContent {
        ToolbarItem(placement: .navigation) {
            toolbarLabel
        }
        .sharedBackgroundVisibility(.hidden)
    }

    @ToolbarContentBuilder
    private var legacyToolbar: some ToolbarContent {
        ToolbarItem(placement: .navigation) {
            toolbarLabel
        }
    }

    private var toolbarLabel: some View {
        HStack(spacing: 12) {
            SettingsNavigationButtons(
                canGoBack: !backStack.isEmpty,
                canGoForward: !forwardStack.isEmpty,
                goBack: goBack,
                goForward: goForward
            )

            Text(currentPanel.title)
                .font(.system(size: 15, weight: .semibold))
                .lineLimit(1)
                .fixedSize()
        }
    }

    private func navigate(to panel: SettingsPanel) {
        let previous = currentPanel
        guard previous != panel else { return }

        backStack.append(previous)
        forwardStack.removeAll()
        viewModel.rememberSelectedPanel(panel)
    }

    private func goBack() {
        guard let previous = backStack.popLast() else { return }
        forwardStack.append(currentPanel)
        viewModel.rememberSelectedPanel(previous)
    }

    private func goForward() {
        guard let next = forwardStack.popLast() else { return }
        backStack.append(currentPanel)
        viewModel.rememberSelectedPanel(next)
    }
}

private struct SettingsNavigationButtons: View {
    let canGoBack: Bool
    let canGoForward: Bool
    let goBack: () -> Void
    let goForward: () -> Void

    var body: some View {
        if #available(macOS 26.0, *) {
            buttons.glassEffect(.regular, in: Capsule())
        } else {
            buttons
                .background(.thinMaterial, in: Capsule())
                .overlay {
                    Capsule()
                        .stroke(Color.primary.opacity(0.1), lineWidth: 1)
                }
        }
    }

    private var buttons: some View {
        HStack(spacing: 0) {
            navigationButton(
                systemImage: "chevron.left",
                label: "返回",
                isEnabled: canGoBack,
                action: goBack
            )

            Rectangle()
                .fill(Color(nsColor: .separatorColor).opacity(0.22))
                .frame(width: 1, height: 17)

            navigationButton(
                systemImage: "chevron.right",
                label: "前进",
                isEnabled: canGoForward,
                action: goForward
            )
        }
        .frame(width: 72, height: 32)
    }

    private func navigationButton(
        systemImage: String,
        label: String,
        isEnabled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 17, weight: .medium))
                .frame(width: 35, height: 32)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(isEnabled ? Color.primary.opacity(0.72) : Color.secondary.opacity(0.28))
        .disabled(!isEnabled)
        .accessibilityLabel(Text(label))
        .help(label)
    }
}

public struct SettingsAlertItem: Identifiable {
    public var id: String { message }
    public let message: String
    public init(message: String) { self.message = message }
}
