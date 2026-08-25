import SwiftUI
import AppKit

public struct VersionsTabView: View {
    @ObservedObject var viewModel = SettingsViewModel.shared

    public init() {}

    public var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SettingsSection("当前版本", footer: "切换版本会重启 DSH 服务；当前使用的版本不能直接卸载。") {
                if let active = viewModel.selectedVersion {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(active)
                                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                            Text("当前用于启动 DSH 服务")
                                .font(.system(size: 10))
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        Text("运行中")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(.green)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 5)
                            .background(.green.opacity(0.12), in: Capsule())
                    }
                    .padding(14)
                } else {
                    HStack(spacing: 10) {
                        Text("未检测到已安装版本")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }
                    .padding(14)
                }
            }

            versionCompatibilityNotice

            if viewModel.isInstallingVersion {
                HStack(spacing: 10) {
                    ProgressView().controlSize(.small)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(viewModel.installProgressPhase)
                            .font(.system(size: 12, weight: .medium))
                        if let detail = viewModel.installProgressDetail, !detail.isEmpty {
                            Text(detail)
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    Spacer()
                }
                .padding(12)
                .background(Color.accentColor.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }

            if viewModel.isUninstallingVersion, let version = viewModel.uninstallingVersionName {
                HStack(spacing: 10) {
                    ProgressView().controlSize(.small)
                    Text("正在卸载 DSH \(version)…")
                        .font(.system(size: 12, weight: .medium))
                    Spacer()
                }
                .padding(12)
                .background(Color.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }

            SettingsSection(
                "官方版本",
                footer: "仅显示最近 5 个版本；最新版本来自 npm latest，带有 next 标签的版本是上游预发布候选。"
            ) {
                VStack(spacing: 0) {
                    HStack {
                        Text("从 npm Registry 获取")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                        Spacer()
                        Button("在 npm 中查看") {
                            if let url = URL(string: "https://www.npmjs.com/package/@deepseek-ai/dsh") {
                                NSWorkspace.shared.open(url)
                            }
                        }
                        .buttonStyle(.link)
                        .controlSize(.small)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)

                    SettingsDivider()

                    if viewModel.availableVersions.isEmpty {
                        HStack(spacing: 8) {
                            ProgressView().controlSize(.small)
                            Text("正在获取官方版本…")
                                .font(.system(size: 12))
                                .foregroundStyle(.secondary)
                            Spacer()
                        }
                        .padding(14)
                    } else {
                        let displayed = Array(viewModel.availableVersions.prefix(5))

                        ForEach(Array(displayed.enumerated()), id: \.element.id) { index, item in
                            versionRow(for: item)
                            if index < displayed.count - 1 { SettingsDivider() }
                        }
                    }
                }
            }
        }
    }

    private var versionCompatibilityNotice: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("版本兼容性说明")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.primary)

            Text("1. 部分插件可能尚未适配最新上游版本；如遇兼容性问题，请联系相关插件开发者进行适配。\n2. 上游版本可能包含破坏性更新；安装新版本后，即使旧版本仍同时保留在本机，也可能无法继续使用。")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 2)
    }

    @ViewBuilder
    private func versionRow(for item: DshVersionItem) -> some View {
        HStack(spacing: 9) {
            Image(systemName: item.isSelected ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 13))
                .foregroundStyle(item.isSelected ? Color.accentColor : Color.secondary.opacity(0.5))

            Text(item.version)
                .font(.system(size: 12.5, weight: .semibold, design: .monospaced))

            if item.tags.contains("latest") {
                versionBadge("最新", color: .green)
            } else if item.tags.contains("next") {
                versionBadge("next", color: .orange)
            }

            Spacer()

            if item.isSelected {
                Text("使用中")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            } else if item.isInstalled {
                HStack(spacing: 6) {
                    Button("切换") { viewModel.selectVersion(item.version) }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(viewModel.isInstallingVersion || viewModel.isSwitchingVersion || viewModel.isUninstallingVersion)
                    Button("卸载") { viewModel.uninstallVersion(item.version) }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(viewModel.isInstallingVersion || viewModel.isSwitchingVersion || viewModel.isUninstallingVersion)
                }
            } else {
                Button("安装") { viewModel.installVersion(item.version) }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .disabled(viewModel.isInstallingVersion || viewModel.isSwitchingVersion || viewModel.isUninstallingVersion)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 7)
    }

    private func versionBadge(_ label: String, color: Color) -> some View {
        Text(label)
            .font(.system(size: 9.5, weight: .bold))
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(color.opacity(0.12), in: Capsule())
    }
}
