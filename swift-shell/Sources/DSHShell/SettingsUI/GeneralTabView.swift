import SwiftUI

@MainActor
final class GeneralTabViewModel: ObservableObject {
    @Published var tempPort: String = "3080"

    func syncFromSettings(_ settings: SettingsViewModel) {
        tempPort = String(settings.dshPort)
    }
}

public struct GeneralTabView: View {
    @ObservedObject var viewModel = SettingsViewModel.shared
    @ObservedObject private var localState = GeneralTabViewModel()

    public init() {}

    public var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            SettingsSection(
                "行为",
                footer: "这些选项会立即保存；服务相关的改动会在下次启动或重启时生效。"
            ) {
                SettingsRow(
                    icon: "arrow.triangle.2.circlepath",
                    tint: .blue,
                    title: viewModel.autoFollowLatest ? "自动更新已开启" : "自动更新已关闭",
                    description: "启动后自动安装并切换到官方最新 RC，完成后重启 DSH 服务。"
                ) {
                    Toggle("", isOn: Binding(
                        get: { viewModel.autoFollowLatest },
                        set: {
                            viewModel.autoFollowLatest = $0
                            viewModel.saveGeneralSettings()
                        }
                    ))
                    .labelsHidden()
                    .toggleStyle(.switch)
                    .controlSize(.small)
                }

                SettingsDivider()

                SettingsRow(
                    icon: "character.book.closed",
                    tint: .purple,
                    title: viewModel.translateCommands ? "命令说明汉化已开启" : "命令说明汉化已关闭",
                    description: "将 /compact、/plan、/permission 等内置斜杠命令的说明提示显示为简体中文。"
                ) {
                    Toggle("", isOn: Binding(
                        get: { viewModel.translateCommands },
                        set: {
                            viewModel.translateCommands = $0
                            viewModel.saveGeneralSettings()
                        }
                    ))
                    .labelsHidden()
                    .toggleStyle(.switch)
                    .controlSize(.small)
                }
            }

            SettingsSection("外观", footer: "主题切换会同步到正在运行的 DSH 页面。") {
                SettingsRow(
                    icon: "paintbrush",
                    tint: .orange,
                    title: "界面主题",
                    description: "选择 DSH 的配色风格。"
                ) {
                    Picker("", selection: Binding(
                        get: { viewModel.uiTheme },
                        set: {
                            viewModel.uiTheme = $0
                            viewModel.saveGeneralSettings()
                        }
                    )) {
                        Text("默认").tag("default")
                        Text("Claude Code").tag("claude")
                    }
                    .pickerStyle(.segmented)
                    .controlSize(.small)
                    .frame(width: 190)
                }
            }

            SettingsSection(
                "网络",
                footer: "镜像源同时用于版本目录、DSH 版本和插件安装。"
            ) {
                SettingsRow(
                    icon: "network",
                    tint: .green,
                    title: "npm 镜像地址",
                    description: "网络较慢或官方源不可用时，可以切换到备用镜像。"
                ) {
                    Picker("", selection: Binding(
                        get: { viewModel.npmRegistry },
                        set: {
                            viewModel.npmRegistry = $0
                            viewModel.saveGeneralSettings()
                        }
                    )) {
                        Text("官方 npm").tag("https://registry.npmjs.org/")
                        Text("淘宝镜像").tag("https://registry.npmmirror.com/")
                        Text("腾讯云镜像").tag("https://mirrors.cloud.tencent.com/npm/")
                        Text("华为云镜像").tag("https://mirrors.huaweicloud.com/repository/npm/")
                    }
                    .pickerStyle(.menu)
                    .controlSize(.small)
                    .frame(width: 168)
                }
            }

            SettingsSection(
                "服务",
                footer: "端口范围为 1024–65535；保存后会自动重启 DSH 服务。"
            ) {
                SettingsRow(
                    icon: "point.3.connected.trianglepath.dotted",
                    tint: .teal,
                    title: "DSH 启动端口",
                    description: "DSH 服务监听的本地端口，默认使用 3080。"
                ) {
                    HStack(spacing: 7) {
                        TextField("端口", text: Binding(
                            get: { localState.tempPort },
                            set: { localState.tempPort = $0 }
                        ))
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 12, design: .monospaced))
                        .frame(width: 70)

                        Button("保存") {
                            savePort()
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)

                        if localState.tempPort != "3080" {
                            Button("恢复默认") {
                                localState.tempPort = "3080"
                                let changed = viewModel.dshPort != 3080
                                viewModel.dshPort = 3080
                                viewModel.saveGeneralSettings()
                                if changed { viewModel.restartDshService() }
                            }
                            .buttonStyle(.borderless)
                            .controlSize(.small)
                            .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .onAppear {
            localState.syncFromSettings(viewModel)
        }
    }

    private func savePort() {
        guard let port = Int(localState.tempPort), (1024...65535).contains(port) else {
            viewModel.alertMessage = "请输入 1024 到 65535 之间的有效端口。"
            return
        }

        let changed = port != viewModel.dshPort
        viewModel.dshPort = port
        viewModel.saveGeneralSettings()
        if changed { viewModel.restartDshService() }
    }
}
