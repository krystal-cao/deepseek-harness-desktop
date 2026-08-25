import AppKit
import SwiftUI

public struct AboutTabView: View {
    @Environment(\.colorScheme) private var colorScheme

    private struct OpenSourceProject: Identifiable {
        let name: String
        let description: String
        let url: URL

        var id: String { name }
    }

    private let projectURL = URL(string: "https://github.com/krystal-cao/deepseek-harness-desktop")!
    private let licenseURL = URL(string: "https://github.com/krystal-cao/deepseek-harness-desktop/blob/main/LICENSE")!
    private let authorURL = URL(string: "https://github.com/krystal-cao")!

    private let openSourceProjects = [
        OpenSourceProject(
            name: "DeepSeek Harness",
            description: "核心 CLI 与 Web UI · MIT License",
            url: URL(string: "https://github.com/deepseek-ai/deepseek-harness")!
        ),
        OpenSourceProject(
            name: "Node.js",
            description: "随应用内置的 JavaScript 运行时 · MIT License",
            url: URL(string: "https://github.com/nodejs/node")!
        ),
        OpenSourceProject(
            name: "pnpm",
            description: "用于安装 DSH 版本与插件 · MIT License",
            url: URL(string: "https://github.com/pnpm/pnpm")!
        ),
        OpenSourceProject(
            name: "deepseek-harness-desktop",
            description: "项目最初的代码基础 · MIT License",
            url: URL(string: "https://github.com/steven-kid/deepseek-harness-desktop")!
        )
    ]

    public init() {}

    private var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "开发版"
    }

    private var appIcon: NSImage {
        ApplicationIcon.image
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            appIdentity

            SettingsSection(
                "应用",
                footer: "DSH Desktop 是非官方社区项目，与 DeepSeek 不存在隶属或官方合作关系。"
            ) {
                AboutValueRow(title: "版本", value: appVersion)

                SettingsDivider()

                AboutLinkRow(
                    title: "项目主页",
                    description: "源代码、使用说明与问题反馈",
                    url: projectURL
                )

                SettingsDivider()

                AboutLinkRow(
                    title: "开源许可",
                    description: "MIT License",
                    url: licenseURL
                )

                SettingsDivider()

                AboutLinkRow(
                    title: "制作人",
                    description: "Krystal Cao",
                    url: authorURL
                )
            }

            SettingsSection(
                "开源项目",
                footer: "这里列出 Swift 版直接集成、随包分发或需要保留归属说明的主要项目。"
            ) {
                ForEach(Array(openSourceProjects.enumerated()), id: \.element.id) { index, project in
                    AboutLinkRow(
                        title: project.name,
                        description: project.description,
                        url: project.url
                    )

                    if index < openSourceProjects.count - 1 {
                        SettingsDivider()
                    }
                }
            }
        }
    }

    private var appIdentity: some View {
        HStack(spacing: 12) {
            Image(nsImage: appIcon)
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: 64, height: 64)

            VStack(alignment: .leading, spacing: 4) {
                Text("DSH")
                    .font(.title2.weight(.semibold))

                Text("DeepSeek Harness Desktop")
                    .font(.callout)
                    .foregroundStyle(.secondary)

                Text("版本 \(appVersion)")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)
        }
        // The app icon artwork has its own transparent safe area. A smaller
        // leading inset keeps the visible icon edge aligned with the rows below.
        .padding(.leading, 12)
        .padding(.trailing, 24)
        .padding(.vertical, 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(groupFill)
        }
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(groupStroke, lineWidth: 1)
        }
    }

    private var groupFill: Color {
        colorScheme == .dark ? Color.white.opacity(0.07) : Color.black.opacity(0.035)
    }

    private var groupStroke: Color {
        colorScheme == .dark ? Color.white.opacity(0.08) : Color.black.opacity(0.035)
    }
}

private struct AboutValueRow: View {
    let title: String
    let value: String

    var body: some View {
        HStack(spacing: 14) {
            Text(title)
                .font(.callout.weight(.semibold))

            Spacer(minLength: 16)

            Text(value)
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 10)
    }
}

private struct AboutLinkRow: View {
    let title: String
    let description: String
    let url: URL

    var body: some View {
        Button {
            NSWorkspace.shared.open(url)
        } label: {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(.primary)

                    Text(description)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 16)

                Image(systemName: "arrow.up.right")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.tertiary)
                    .frame(width: 24, height: 24)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help("在浏览器中打开 \(title)")
    }
}
