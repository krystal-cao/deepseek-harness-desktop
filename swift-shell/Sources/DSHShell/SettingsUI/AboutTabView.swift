import SwiftUI

public struct AboutTabView: View {
    @ObservedObject var viewModel = SettingsViewModel.shared

    private let labelWidth: CGFloat = 120

    public init() {}

    public var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            // Group 1: App Info
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top, spacing: 16) {
                    Image(systemName: "cube.transparent.fill")
                        .font(.system(size: 32))
                        .foregroundColor(.accentColor)

                    VStack(alignment: .leading, spacing: 4) {
                        Text("DeepSeek Harness Desktop")
                            .font(.system(size: 15, weight: .bold))

                        Text("macOS Swift Native Shell  •  v0.2.0")
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(nsColor: .controlBackgroundColor).opacity(0.7))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(nsColor: .separatorColor).opacity(0.3), lineWidth: 1))
            )

            // Group 2: Runtime Paths
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top, spacing: 16) {
                    Text("Node 运行时:")
                        .font(.system(size: 13, weight: .medium))
                        .frame(width: labelWidth, alignment: .trailing)
                        .padding(.top, 2)

                    Text(NodeRuntime.shared.resolveNodeBinary() ?? "未检测到")
                        .font(.system(size: 11, design: .monospaced))
                        .lineLimit(1)
                }

                Divider()
                    .padding(.leading, labelWidth + 16)

                HStack(alignment: .top, spacing: 16) {
                    Text("DSH 入口:")
                        .font(.system(size: 13, weight: .medium))
                        .frame(width: labelWidth, alignment: .trailing)
                        .padding(.top, 2)

                    Text(DshVersionManager.shared.resolveCurrentEntry() ?? "未安装")
                        .font(.system(size: 11, design: .monospaced))
                        .lineLimit(1)
                }
            }
            .padding(18)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(nsColor: .controlBackgroundColor).opacity(0.7))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(nsColor: .separatorColor).opacity(0.3), lineWidth: 1))
            )

            // Group 3: Actions
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .center, spacing: 16) {
                    Text("快捷控制:")
                        .font(.system(size: 13, weight: .medium))
                        .frame(width: labelWidth, alignment: .trailing)

                    HStack(spacing: 12) {
                        Button("重启 DSH 服务") {
                            viewModel.restartDshService()
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)

                        Button("访问 GitHub 仓库") {
                            if let url = URL(string: "https://github.com/krystal-cao/deepseek-harness-desktop") {
                                NSWorkspace.shared.open(url)
                            }
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    }
                }
            }
            .padding(18)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(nsColor: .controlBackgroundColor).opacity(0.7))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(nsColor: .separatorColor).opacity(0.3), lineWidth: 1))
            )
        }
    }
}
