import SwiftUI
import AppKit

/// Uses Liquid Glass for functional controls on macOS 26+, with a material
/// fallback for older supported systems. The content layer stays opaque and
/// quiet, matching Apple's current hierarchy guidance.
struct SettingsGlassModifier: ViewModifier {
    let cornerRadius: CGFloat

    func body(content: Content) -> some View {
        if #available(macOS 26.0, *) {
            content.glassEffect(.regular, in: RoundedRectangle(cornerRadius: cornerRadius))
        } else {
            content
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius))
                .overlay(
                    RoundedRectangle(cornerRadius: cornerRadius)
                        .stroke(Color.primary.opacity(0.12), lineWidth: 0.7)
                )
        }
    }
}

extension View {
    func settingsGlass(cornerRadius: CGFloat = 12) -> some View {
        modifier(SettingsGlassModifier(cornerRadius: cornerRadius))
    }
}

public struct VisualEffectView: NSViewRepresentable {
    var material: NSVisualEffectView.Material = .sidebar
    var blendingMode: NSVisualEffectView.BlendingMode = .behindWindow

    public init(
        material: NSVisualEffectView.Material = .sidebar,
        blendingMode: NSVisualEffectView.BlendingMode = .behindWindow
    ) {
        self.material = material
        self.blendingMode = blendingMode
    }

    public func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = material
        view.blendingMode = blendingMode
        view.state = .followsWindowActiveState
        return view
    }

    public func updateNSView(_ nsView: NSVisualEffectView, context: Context) {
        nsView.material = material
        nsView.blendingMode = blendingMode
    }
}

public enum SettingsPanel: Int, CaseIterable, Identifiable, Hashable {
    case general = 0
    case versions = 1
    case plugins = 2

    public var id: Int { rawValue }

    public var title: String {
        switch self {
        case .general: return "通用设置"
        case .versions: return "版本管理"
        case .plugins: return "插件管理"
        }
    }

    public var navTitle: String {
        switch self {
        case .general: return "通用"
        case .versions: return "版本"
        case .plugins: return "插件"
        }
    }

    public var icon: String {
        switch self {
        case .general: return "gearshape.fill"
        case .versions: return "shippingbox.fill"
        case .plugins: return "puzzlepiece.extension.fill"
        }
    }

    public var tint: Color {
        switch self {
        case .general: return .blue
        case .versions: return .orange
        case .plugins: return .purple
        }
    }

    public var subtitle: String {
        switch self {
        case .general: return "自动更新、镜像源与端口配置"
        case .versions: return "安装、切换和清理 DSH 版本"
        case .plugins: return "发现并管理 DSH 插件"
        }
    }
}

/// A grouped settings section. macOS settings uses a title outside a rounded
/// group and quiet separators inside it.
struct SettingsSection<Content: View>: View {
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
        VStack(alignment: .leading, spacing: 7) {
            Text(title.uppercased())
                .font(.system(size: 11.5, weight: .semibold))
                .foregroundStyle(.primary)
                .padding(.leading, 5)

            VStack(spacing: 0) {
                content()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.primary.opacity(0.045))
            .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .stroke(Color.primary.opacity(0.075), lineWidth: 0.7)
            )

            if let footer {
                Text(footer)
                    .font(.system(size: 9.5))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 4)
            }
        }
    }
}

struct SettingsRow<Accessory: View>: View {
    private let accessoryColumnWidth: CGFloat = 220

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
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.primary)

                if let description {
                    Text(description)
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }

            Spacer(minLength: 12)

            HStack(spacing: 0) {
                Spacer(minLength: 0)
                accessory()
            }
            .frame(width: accessoryColumnWidth)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, description == nil ? 8 : 10)
    }
}

struct SettingsDivider: View {
    var body: some View { Divider().padding(.leading, 16) }
}

public struct SettingsView: View {
    @ObservedObject var viewModel = SettingsViewModel.shared

    public init() {}

    private var selection: Binding<SettingsPanel?> {
        Binding(
            get: { SettingsPanel(rawValue: viewModel.selectedCategoryIndex) },
            set: { viewModel.rememberSelectedPanel($0 ?? .general) }
        )
    }

    public var body: some View {
        NavigationSplitView {
            sidebar
        } detail: {
            detail
        }
        .navigationSplitViewStyle(.balanced)
        .frame(minWidth: 820, minHeight: 560)
        .background(Color(nsColor: .underPageBackgroundColor))
        .ignoresSafeArea(.container, edges: .top)
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

    private var sidebar: some View {
        ZStack {
            VisualEffectView(material: .sidebar, blendingMode: .behindWindow)

            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 10) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Color.accentColor.gradient)
                        Image(systemName: "cube.transparent.fill")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(.white)
                    }
                    .frame(width: 34, height: 34)

                    VStack(alignment: .leading, spacing: 1) {
                        Text("DSH")
                            .font(.system(size: 15, weight: .bold, design: .rounded))
                        Text("DeepSeek Harness")
                            .font(.system(size: 10))
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal, 17)
                .padding(.top, 40)
                .padding(.bottom, 15)

                List(selection: selection) {
                    Section("设置") {
                        ForEach(SettingsPanel.allCases) { panel in
                            Label {
                                Text(panel.navTitle)
                            } icon: {
                                sidebarIcon(for: panel)
                            }
                            .font(.system(size: 13))
                            .tag(panel)
                        }
                    }
                }
                .listStyle(.sidebar)
                .scrollContentBackground(.hidden)
                .environment(\.defaultMinListRowHeight, 34)

                Spacer(minLength: 10)

                HStack(spacing: 7) {
                    Image(systemName: "shippingbox")
                        .foregroundStyle(.secondary)
                    Text("DSH \(viewModel.selectedVersion ?? viewModel.installedVersions.first ?? "未安装")")
                        .font(.system(size: 10.5, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 18)
            }
        }
        .navigationSplitViewColumnWidth(min: 196, ideal: 220, max: 260)
        // Keep the sidebar background continuous behind the traffic lights.
        .ignoresSafeArea(.container, edges: .top)
    }

    private func sidebarIcon(for panel: SettingsPanel) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 5, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            panel.tint.opacity(0.90),
                            panel.tint.opacity(0.76)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay {
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .stroke(Color.white.opacity(0.24), lineWidth: 0.5)
                }

            Image(systemName: panel.icon)
                .symbolRenderingMode(.hierarchical)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.white.opacity(0.94))
        }
        .frame(width: 20, height: 20)
        .shadow(color: .black.opacity(0.13), radius: 1.1, y: 0.8)
    }

    private var detail: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                switch currentPanel {
                case .general:
                    GeneralTabView()
                case .versions:
                    VersionsTabView()
                case .plugins:
                    PluginsTabView()
                }
            }
            .frame(maxWidth: 720, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.horizontal, 24)
            // Keep the first section below the floating header while allowing
            // later content to scroll behind its glass layer.
            .padding(.top, 74)
            .padding(.bottom, 34)
        }
        .scrollIndicators(.automatic)
        .overlay(alignment: .top) {
            detailHeader
                .zIndex(1)
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .ignoresSafeArea(.container, edges: .top)
    }

    private var detailHeader: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(currentPanel.title)
                    .font(.system(size: 19, weight: .bold))
                    .foregroundStyle(.primary)
                Text(currentPanel.subtitle)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if currentPanel == .versions {
                toolbarButton(
                    systemName: "arrow.clockwise",
                    help: "刷新版本目录",
                    isSpinning: viewModel.isLoadingCatalog
                ) {
                    Task { await viewModel.refreshCatalog() }
                }
            } else if currentPanel == .plugins {
                toolbarButton(
                    systemName: "arrow.clockwise",
                    help: "刷新插件列表",
                    isSpinning: viewModel.isRefreshingPlugins
                ) {
                    Task { await viewModel.refreshPluginList() }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 24)
        .padding(.top, 18)
        .padding(.bottom, 13)
        .frame(height: 70, alignment: .center)
        .background(
            VisualEffectView(material: .headerView, blendingMode: .withinWindow)
        )
        .overlay(alignment: .bottom) {
            Divider().opacity(0.45)
        }
    }

    private var currentPanel: SettingsPanel {
        SettingsPanel(rawValue: viewModel.selectedCategoryIndex) ?? .general
    }

    @ViewBuilder
    private func toolbarButton(
        systemName: String,
        help: String,
        isSpinning: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            rotatingRefreshIcon(systemName: systemName, isSpinning: isSpinning)
        }
        // Use the native bordered control here. Applying a custom glass
        // modifier after a plain button can leave the visual layer above the
        // button's hit-test region on macOS 26.
        .buttonStyle(.plain)
        .controlSize(.small)
        .contentShape(Rectangle())
        .disabled(isSpinning)
        .accessibilityLabel(Text(help))
        .help(help)
    }

    @ViewBuilder
    private func rotatingRefreshIcon(systemName: String, isSpinning: Bool) -> some View {
        if isSpinning {
            // A timeline keeps the rotation alive for the entire async
            // request. A state-driven 0 → 360 animation can be rebuilt by
            // SwiftUI and end up moving only once.
            TimelineView(.animation(minimumInterval: 1.0 / 60.0)) { context in
                refreshIcon(systemName: systemName, angle: rotationAngle(at: context.date))
            }
        } else {
            refreshIcon(systemName: systemName, angle: 0)
        }
    }

    private func refreshIcon(systemName: String, angle: Double) -> some View {
        Image(systemName: systemName)
            .font(.system(size: 13, weight: .semibold))
            .frame(width: 30, height: 30)
            .rotationEffect(.degrees(angle))
    }

    private func rotationAngle(at date: Date) -> Double {
        let cycleDuration = 0.9
        let progress = date.timeIntervalSinceReferenceDate
            .truncatingRemainder(dividingBy: cycleDuration) / cycleDuration
        return progress * 360
    }
}

public struct SettingsAlertItem: Identifiable {
    public var id: String { message }
    public let message: String
    public init(message: String) { self.message = message }
}
