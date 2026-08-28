# Swift 独立项目交接说明

本文档用于把 DeepSeek Harness Desktop 的 Swift 原生 macOS 壳交接给专门的 Swift 项目继续维护。后续 Swift 代码、构建、签名、发布和问题修复，默认在独立仓库中进行，不再回到 Electron 仓库修改。

## 1. 仓库和职责边界

### Electron 主仓库

- 仓库：https://github.com/summer-521/deepseek-harness-desktop
- 本地路径：/Users/caocan/Documents/ChatGPT/deepseek-harness-desktop
- 当前分支：main
- Swift 拆分提交：3b8b403 refactor: split Swift shell into standalone repository
- 负责 Electron 版本的桌面壳、构建和发布。
- Swift 源码已经从本仓库移出，不应继续在这里实现 Swift 功能。

### Swift 独立仓库

- 仓库：https://github.com/summer-521/deepseek-harness-swift
- 本地路径：/Users/caocan/Documents/ChatGPT/deepseek-harness-swift
- 当前分支：main
- 当前提交：344ed2b release: publish v1.0.0 build 6
- 当前版本：1.0.0
- 当前 build：6
- 当前 Release：https://github.com/summer-521/deepseek-harness-swift/releases/tag/v1.0.0
- 更新源：https://raw.githubusercontent.com/summer-521/deepseek-harness-swift/main/appcast-swift.xml

Swift 仓库是标准 Xcode 工程，入口为 DSH.xcodeproj。它不依赖 Electron 仓库，也不需要 npm install 或 npm ci 才能构建应用。

## 2. 当前 Git 状态

Electron 主仓库当前没有未提交改动。

Swift 仓库在本次交接时的状态：

- main 已推送到远端，最新提交为 344ed2b。
- Swift 源码、Xcode 工程、build 6 版本配置、build 6 appcast、测试和发布交接文档已经提交。
- Swift 仓库的 .gitignore 中新增 .vscode/ 的修改目前仍是本地未提交改动。
- 本地 .vscode/ 内容没有纳入 Git，也不应提交。
- 接手后可以单独提交并推送 .gitignore，或把它并入下一次正常提交。

接手后的第一步：

~~~bash
cd /Users/caocan/Documents/ChatGPT/deepseek-harness-swift
git switch main
git pull --ff-only origin main
git status --short
~~~

## 3. Swift 应用当前实现

Swift 壳使用 AppKit、SwiftUI 和 WKWebView：

- AppKit 管理主窗口、交通灯、Dock 恢复、窗口拖拽、标题栏双击和菜单。
- SwiftUI 提供独立设置窗口和设置页。
- WKWebView 承载 DSH Web UI。
- DSH 服务由 Swift 管理，使用应用内置 Node.js 和 pnpm。
- 应用包不内置 DSH npm 本体，首次运行时从 npm Registry 安装。
- 支持 DSH 版本安装、切换、卸载和跟随 npm latest。
- 支持 web profile 插件安装、更新、卸载和服务重启。
- 支持 DSH 任务完成系统通知。
- Sparkle 用于 Swift 应用包的检查更新和 Ed25519 签名验证。

设置页包含通用设置、版本管理、插件管理和关于页面。关于页当前显示：

- 应用图标和名称
- 版本格式：1.0.0 build 6
- Swift 独立项目主页
- MIT License
- 制作人和主要开源项目

版本显示从 Info.plist 的 CFBundleShortVersionString 和 CFBundleVersion 读取，不要硬编码版本或 build。

## 4. 目录和关键文件

~~~text
DSH.xcodeproj/                 标准 Xcode 工程
Sources/                       Swift 源码
Sources/SettingsUI/            设置页，包括 AboutTabView.swift
Sources/Updates/               Sparkle 更新管理
Info.plist                     Bundle 元数据和 Sparkle 公钥/feed
Version.xcconfig               SWIFT_APP_VERSION 和 SWIFT_APP_BUILD
app.icon/                      Icon Composer 图标源文件
assets/dsh-desktop-host/       Swift 版桥接插件副本
assets/dsh-family.json         DSH 运行时家族清单
assets/bin/pnpm                应用内 pnpm 入口脚本
scripts/build-app.sh           分架构构建 Swift .app
scripts/package-dmg.sh         分架构制作和验证 DMG
scripts/fetch-node.sh          准备目标架构 Node.js
scripts/fetch-pnpm.sh          下载并校验 pnpm
appcast-swift.xml              Sparkle 更新源
test/                          源码和工程配置测试
RELEASE_HANDOFF.md              Swift 仓库内的构建/签名发布详细交接
~~~

生成内容由 .gitignore 排除：

- .build/
- dist/
- assets/node/
- assets/bin/pnpm-pkg/
- DSH.xcodeproj/**/xcuserdata/
- .vscode/

## 5. 日常开发和测试

Swift 仓库没有需要安装的 npm 依赖，测试使用 Node.js 内置模块：

~~~bash
cd /Users/caocan/Documents/ChatGPT/deepseek-harness-swift
npm test
~~~

当前测试共 15 项，覆盖图标资源、WKWebView 下载、标题栏交互、Xcode 工程配置、Sparkle 配置、版本配置和关于页 build 显示。

涉及脚本时还要运行：

~~~bash
bash -n scripts/build-app.sh scripts/package-dmg.sh scripts/fetch-node.sh scripts/fetch-pnpm.sh
~~~

## 6. 本地构建流程

环境要求：

- macOS 13+
- 支持 Swift 5.9 的 Xcode
- 可访问 Swift Package Manager、GitHub、Node.js 官方下载地址和 npm Registry
- xcodebuild、codesign、hdiutil、lipo、curl、tar、shasum
- 发布时需要具有仓库写权限的 gh

构建并打包两个架构：

~~~bash
cd /Users/caocan/Documents/ChatGPT/deepseek-harness-swift
DSH_NODE_SOURCE=official bash scripts/build-app.sh
DSH_NODE_SOURCE=official bash scripts/package-dmg.sh
~~~

输出：

~~~text
dist/arm64/DSH.app
dist/x86_64/DSH.app
dist/DSH-Desktop-1.0.0-arm64.dmg
dist/DSH-Desktop-1.0.0-x64.dmg
~~~

脚本会准备目标架构 Node.js、下载并校验固定版本 pnpm、执行 Xcode Release 构建、校验应用资源、执行 ad-hoc codesign、制作并验证 DMG。所有 DMG 成功后会清理 .build。

单架构调试：

~~~bash
DSH_BUILD_ARCH=arm64 DSH_NODE_SOURCE=official bash scripts/build-app.sh
DSH_BUILD_ARCH=x86_64 DSH_NODE_SOURCE=official bash scripts/build-app.sh
~~~

当前不生成 Universal 包，发布包按 arm64 和 x86_64 分开提供。

## 7. 版本管理规则

版本配置位于 Version.xcconfig：

~~~text
SWIFT_APP_VERSION = 1.0.0
SWIFT_APP_BUILD = 6
MARKETING_VERSION = $(SWIFT_APP_VERSION)
CURRENT_PROJECT_VERSION = $(SWIFT_APP_BUILD)
~~~

规则：

- 同一营销版本的修复包只增加 build，例如 1.0.0 build 6 → 1.0.0 build 7。
- 新营销版本使用新的 tag，例如 1.0.1 build 1 → v1.0.1。
- CFBundleVersion、appcast 的 sparkle:version 和 Sparkle 比较用 build 必须一致。
- CFBundleShortVersionString、appcast 的 sparkle:shortVersionString 和 SWIFT_APP_VERSION 必须一致。
- 不要只改关于页文本；版本必须从 Xcode 配置和 Info.plist 传递。

当前 v1.0.0 的 build 6 是在同一 Release 下替换 build 5 同名 DMG，tag 本身没有移动。今后新营销版本应创建新 tag，不要强制移动已发布 tag。

## 8. Sparkle 签名和发布流程

Sparkle account 为 dsh-swift，公钥在 Info.plist 的 SUPublicEDKey。Ed25519 私钥只保存在发布机器 Keychain，不能提交到 Git、写入脚本、上传到仓库或放入普通工作流文件。当前没有 Developer ID 签名和 notarization，也不能直接用 GitHub Actions 完成本地 Keychain 签名。

Sparkle 工具路径随 Xcode DerivedData 变化，发布时先定位 sign_update：

~~~bash
find ~/Library/Developer/Xcode -type f -name sign_update -perm -111
export SPARKLE_BIN="/path/to/Sparkle/bin"
test -x "$SPARKLE_BIN/sign_update"
~~~

对最终 DMG 执行签名：

~~~bash
"$SPARKLE_BIN/sign_update" --account dsh-swift dist/DSH-Desktop-1.0.0-arm64.dmg
"$SPARKLE_BIN/sign_update" --account dsh-swift dist/DSH-Desktop-1.0.0-x64.dmg
~~~

重新打包后必须重新签名。签名输出中的 length 必须和最终上传文件的真实字节数一致。

当前 build 6 签名记录：

- arm64：length 46599382，签名 g/XqKp/tunu56n0D2h7lkCn7al8YHyQeOaqXHJT2gHBnMhIeAEqkAJiqZpDf9EcTKPaLA30AvBOmo6ICSRxxCQ==
- x86_64：length 47681169，签名 UFuzgDOY9tvq/3mSZiW6Z/7kct4VukyMW7/lLlnVIlnaf/3gQEmIhkO5kdhwmqMq4R56YNvfeh1sYCr3uOa3CA==

这些签名已经写入 Swift 仓库 appcast-swift.xml，对应 DMG 也已经上传到 v1.0.0 Release。

appcast 更新时，每个架构 item 都要同步检查：

- sparkle:version
- sparkle:shortVersionString
- sparkle:hardwareRequirements
- pubDate
- enclosure URL
- enclosure length
- sparkle:edSignature

验证 XML：

~~~bash
ruby -rrexml/document -e 'REXML::Document.new(File.read("appcast-swift.xml")); puts "appcast XML valid"'
~~~

同一 v1.0.0 build 继续替换同名资产时：

~~~bash
gh release upload v1.0.0 dist/DSH-Desktop-1.0.0-arm64.dmg dist/DSH-Desktop-1.0.0-x64.dmg --repo summer-521/deepseek-harness-swift --clobber
~~~

新营销版本建议顺序：

1. 修改 Version.xcconfig。
2. 构建两个架构并制作 DMG。
3. 对最终 DMG 执行 sign_update。
4. 更新并校验 appcast-swift.xml。
5. 提交并推送源码、版本配置和 appcast。
6. 创建新 tag 并推送。
7. 创建 GitHub Release 并上传两个 DMG。
8. 验证 raw appcast 和下载链接。
9. 用低于新 build 的已安装应用测试 Sparkle 更新。

## 9. 当前已知事项和建议后续

必须先处理：

1. Swift 仓库 .gitignore 中新增 .vscode/ 的修改目前仍未提交，接手后可单独提交并推送。
2. 从 build 5 安装的应用执行一次“检查更新”，确认它能发现 build 6、下载正确架构 DMG，并通过 Sparkle 签名校验。
3. 如果测试机已有 build 6，则不会再次发现相同 build；测试必须使用更低 build 或未来更高 build。

可以后续优化：

- Swift README 顶部 Swift badge 仍可能指向 Electron 仓库历史的 v1.0.0-swift 标签，下载链接本身已经指向独立 Swift Release；后续可统一 badge 链接。
- 可以把 appcast 生成、DMG 大小校验和签名结果填充做成辅助脚本，但签名私钥仍应由本地 Keychain 管理。
- 未来如果需要 GitHub Actions 发布，必须先设计受控 macOS runner、Keychain 和签名凭证生命周期。
- 如果引入 Developer ID/notarization，需要重新设计发布文档和构建脚本，不能与当前 ad-hoc 流程混用。

## 10. 接手时的工作方式

- Swift 功能只在 deepseek-harness-swift 仓库修改。
- Electron 功能只在 deepseek-harness-desktop 仓库修改。
- 跨仓库修改前先确认变更属于哪个仓库。
- 优先使用命令行、Xcode 工程和脚本，不要依赖 GUI 自动化。
- 用户明确要求：如果必须使用 Computer Use，必须先说明原因并取得同意；未获同意前不要申请或执行 Computer Use。
- 不要删除或覆盖用户已有的未提交改动；先检查 git status。
- 提交前运行测试，发布前核对 DMG 架构、文件大小、签名和 appcast。
- 不要把私钥、Keychain 导出文件、访问令牌或本机绝对路径写进仓库。

接手后的首轮检查：

~~~bash
cd /Users/caocan/Documents/ChatGPT/deepseek-harness-swift
git status --short
git log -3 --oneline
npm test
ruby -rrexml/document -e 'REXML::Document.new(File.read("appcast-swift.xml")); puts "appcast XML valid"'
~~~

本交接的目标是让 Swift 项目可以独立完成后续开发和本地发布，同时保持 Electron 仓库只承担 Electron 版本的职责。
