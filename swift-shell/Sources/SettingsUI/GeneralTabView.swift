import SwiftUI

@MainActor
final class GeneralTabViewModel: ObservableObject {
    @Published var tempPort: String = "3080"

    func syncFromSettings(_ settings: SettingsViewModel) {
        tempPort = String(settings.dshPort)
    }
}

public struct GeneralTabView: View {
    private struct RegistryOption: Identifiable {
        let title: String
        let url: String

        var id: String { url }
    }

    private static let registryOptions = [
        RegistryOption(title: "官方 npm", url: DshVersionManager.defaultRegistry),
        RegistryOption(title: "淘宝镜像", url: DshVersionManager.mirrorRegistry),
        RegistryOption(title: "腾讯云镜像", url: "https://mirrors.cloud.tencent.com/npm"),
        RegistryOption(title: "华为云镜像", url: "https://mirrors.huaweicloud.com/repository/npm")
    ]

    @ObservedObject var viewModel = SettingsViewModel.shared
    @StateObject private var localState = GeneralTabViewModel()
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case port
    }

    public init() {}

    private var themeFooter: String {
        if let externalTheme = viewModel.externalTheme {
            return "已检测到第三方主题（" + externalTheme + "），内置主题已锁定以避免样式冲突。"
        }
        return "主题切换会同步到正在运行的 DSH 页面。"
    }

    private var currentRegistry: String {
        let normalized = normalizeRegistry(viewModel.npmRegistry)
        return normalized.isEmpty ? DshVersionManager.defaultRegistry : normalized
    }

    private var npmRegistrySelection: Binding<String> {
        Binding(
            get: { currentRegistry },
            set: {
                viewModel.npmRegistry = normalizeRegistry($0)
                viewModel.saveGeneralSettings()
            }
        )
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SettingsSection(
                "行为",
                footer: "这些选项会立即保存；服务相关的改动会在下次启动或重启时生效。"
            ) {
                SettingsRow(
                    title: viewModel.autoFollowLatest ? "自动更新已开启" : "自动更新已关闭",
                    description: "启动后自动安装并切换到官方最新 RC，完成后重启 DSH 服务。"
                ) {
                    HStack(spacing: 0) {
                        Spacer(minLength: 0)
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
                        .fixedSize()
                    }
                    .frame(width: 220, alignment: .trailing)
                }

                SettingsDivider()

                SettingsRow(
                    title: viewModel.translateCommands ? "命令说明汉化已开启" : "命令说明汉化已关闭",
                    description: "将 /compact、/plan、/permission 等内置斜杠命令的说明提示显示为简体中文。"
                ) {
                    HStack(spacing: 0) {
                        Spacer(minLength: 0)
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
                        .fixedSize()
                    }
                    .frame(width: 220, alignment: .trailing)
                }
            }

            SettingsSection("外观", footer: themeFooter) {
                SettingsRow(
                    title: "界面主题",
                    description: "选择 DSH 的配色风格。"
                ) {
                    Picker("", selection: Binding(
                        get: { viewModel.externalTheme == nil ? viewModel.uiTheme : "default" },
                        set: {
                            guard viewModel.externalTheme == nil else { return }
                            viewModel.uiTheme = $0
                            viewModel.saveGeneralSettings()
                        }
                    )) {
                        Text("默认").tag("default")
                        Text("Claude Code").tag("claude")
                    }
                    .pickerStyle(.segmented)
                    .controlSize(.small)
                    .frame(width: 190, alignment: .trailing)
                    .disabled(viewModel.externalTheme != nil)
                }
            }

            SettingsSection(
                "网络",
                footer: "镜像源同时用于版本目录、DSH 版本和插件安装。"
            ) {
                SettingsRow(
                    title: "npm 镜像地址",
                    description: "网络较慢或官方源不可用时，可以切换到备用镜像。"
                ) {
                    Picker("", selection: npmRegistrySelection) {
                        ForEach(Self.registryOptions) { option in
                            Text(option.title).tag(option.url)
                        }
                        if !Self.registryOptions.contains(where: { $0.url == currentRegistry }) {
                            Text("自定义镜像").tag(currentRegistry)
                        }
                    }
                    .pickerStyle(.menu)
                    .controlSize(.small)
                    .frame(width: 168, alignment: .trailing)
                }
            }

            SettingsSection(
                "服务",
                footer: "端口范围为 1024–65535；保存后会自动重启 DSH 服务。"
            ) {
                SettingsRow(
                    title: "DSH 启动端口",
                    description: "DSH 服务监听的本地端口，默认使用 3080。"
                ) {
                    HStack(spacing: 8) {
                        TextField("端口", text: Binding(
                            get: { localState.tempPort },
                            set: { localState.tempPort = $0 }
                        ))
                        .focused($focusedField, equals: .port)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 12, design: .monospaced))
                        .frame(width: 70)

                        Button("保存") {
                            clearPortFocus()
                            savePort()
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                        .frame(width: 54)

                        Button("恢复默认") {
                            clearPortFocus()
                            localState.tempPort = "3080"
                            let changed = viewModel.dshPort != 3080
                            viewModel.dshPort = 3080
                            viewModel.saveGeneralSettings()
                            if changed { viewModel.restartDshService() }
                        }
                        .buttonStyle(.borderless)
                        .controlSize(.small)
                        .foregroundStyle(.secondary)
                        .disabled(localState.tempPort == "3080")
                    }
                }
            }
        }
        .onAppear {
            localState.syncFromSettings(viewModel)
            viewModel.refreshExternalTheme()
            focusedField = nil
            DispatchQueue.main.async {
                focusedField = nil
            }
        }
        .onChange(of: viewModel.dshPort) { newPort in
            let value = String(newPort)
            if localState.tempPort != value {
                localState.tempPort = value
            }
        }
    }

    private func savePort() {
        guard let port = Int(localState.tempPort), (1024...65535).contains(port) else {
            viewModel.alertMessage = "请输入 1024 到 65535 之间的有效端口。"
            return
        }

        let changed = port != viewModel.dshPort
        viewModel.dshPort = port
        localState.tempPort = String(port)
        viewModel.saveGeneralSettings()
        if changed { viewModel.restartDshService() }
    }

    private func clearPortFocus() {
        focusedField = nil
        DispatchQueue.main.async {
            focusedField = nil
        }
    }

    private func normalizeRegistry(_ value: String) -> String {
        var normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
        while normalized.hasSuffix("/") {
            normalized.removeLast()
        }
        return normalized
    }
}
