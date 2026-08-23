import SwiftUI

@MainActor
final class PluginsTabViewModel: ObservableObject {
    @Published var newPluginSpec = ""
}

public struct PluginsTabView: View {
    @ObservedObject var viewModel = SettingsViewModel.shared
    @ObservedObject private var localState = PluginsTabViewModel()

    public init() {}

    private var outdatedCount: Int {
        viewModel.installedPlugins.filter { $0.hasUpdate }.count
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SettingsSection("安装插件", footer: "插件会安装到 web profile；成功后 DSH 服务会自动重启。") {
                HStack(spacing: 9) {
                    TextField("npm 包名、@scope/name 或 github:owner/repo", text: Binding(
                        get: { localState.newPluginSpec },
                        set: { localState.newPluginSpec = $0 }
                    ))
                    .textFieldStyle(.plain)
                    .font(.system(size: 11))

                    Button("安装") {
                        let spec = localState.newPluginSpec.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !spec.isEmpty else { return }
                        localState.newPluginSpec = ""
                        viewModel.addPlugin(spec: spec)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .disabled(localState.newPluginSpec.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isOperatingPlugin)
                    .help("安装指定的 npm 插件")
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }

            if viewModel.isOperatingPlugin {
                HStack(spacing: 9) {
                    ProgressView().controlSize(.small)
                    Text("正在执行插件操作：\(viewModel.operatingPluginName ?? "")")
                        .font(.system(size: 11.5, weight: .medium))
                    Spacer()
                }
                .padding(11)
                .background(Color.accentColor.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }

            SettingsSection("已安装插件", footer: "内置桥接插件由 DSH Desktop 维护，不能卸载。") {
                VStack(spacing: 0) {
                    HStack {
                        Text("\(viewModel.installedPlugins.count) 个插件")
                        .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.secondary)
                        Spacer()
                        if outdatedCount > 0 {
                            Button("全部更新") { viewModel.updateAllPlugins() }
                                .buttonStyle(.borderedProminent)
                                .controlSize(.small)
                                .disabled(viewModel.isOperatingPlugin)
                                .help("更新所有可更新插件")
                        }
                        Button {
                            Task { await viewModel.checkPluginUpdates() }
                        } label: {
                            HStack(spacing: 5) {
                                if viewModel.isCheckingPluginUpdates {
                                    ProgressView()
                                        .controlSize(.small)
                                }
                                Text(viewModel.isCheckingPluginUpdates ? "正在检查…" : "检查更新")
                            }
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(viewModel.isCheckingPluginUpdates || viewModel.isOperatingPlugin)
                        .help("检查已安装插件是否有新版本")
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)

                    SettingsDivider()

                    if viewModel.installedPlugins.isEmpty {
                        HStack(spacing: 9) {
                            Text("暂无安装的扩展插件")
                                .font(.system(size: 12))
                                .foregroundStyle(.secondary)
                            Spacer()
                        }
                        .padding(14)
                    } else {
                        ForEach(Array(viewModel.installedPlugins.enumerated()), id: \.element.id) { index, plugin in
                            pluginRow(for: plugin)
                            if index < viewModel.installedPlugins.count - 1 { SettingsDivider() }
                        }
                    }
                }
            }
        }
        .task {
            if viewModel.outdatedPluginsMap.isEmpty {
                await viewModel.checkPluginUpdates()
            }
        }
    }

    @ViewBuilder
    private func pluginRow(for plugin: DshPluginItem) -> some View {
        HStack(spacing: 11) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(plugin.name)
                        .font(.system(size: 11, weight: .semibold))
                        .lineLimit(1)
                    Text(formatPluginVersion(plugin))
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(.secondary)
                    if let latest = plugin.latestVersion, plugin.hasUpdate {
                        Text("可更新至 \(latest)")
                            .font(.system(size: 8.5, weight: .semibold))
                            .foregroundStyle(.green)
                    }
                }
                Text(pluginDescription(for: plugin.name))
                    .font(.system(size: 9.5))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            if plugin.isManaged {
                Button("内置") {}
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .disabled(true)
                    .help("应用内置核心插件，由桌面宿主统一管理")
            } else {
                HStack(spacing: 6) {
                    if plugin.hasUpdate {
                        Button("更新") { viewModel.updatePlugin(name: plugin.name) }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.small)
                            .help("更新 " + plugin.name + " 到最新版本")
                    }
                    Button("卸载") { viewModel.removePlugin(name: plugin.name) }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .help("卸载 " + plugin.name)
                }
                .disabled(viewModel.isOperatingPlugin)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private func formatPluginVersion(_ plugin: DshPluginItem) -> String {
        if plugin.isManaged { return "本地" }
        guard let version = plugin.version else { return "" }
        return version.hasPrefix("file:") || version.hasPrefix("link:") ? "本地" : version
    }

    private func pluginDescription(for name: String) -> String {
        switch name {
        case "dsh-better-sidebar": return "VSCode 风格的文件、编辑器、终端、Git 与浏览器侧栏。"
        case "dshmarket": return "在 DSH 内浏览、搜索和安装社区插件。"
        case "dsh-desktop-host": return "向桌面外壳报告就绪状态、主题和本地化变化。"
        case "@deepseek-ai/dsh-subagent-claude-code": return "Claude Code 子代理工具集成。"
        case "@deepseek-ai/dsh-subagent-codex": return "Codex 子代理工具集成。"
        default: return "DSH web profile 扩展插件。"
        }
    }
}
