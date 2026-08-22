#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== 1. Preparing Node.js Runtime ==="
bash "${REPO_DIR}/scripts/fetch-node.sh"

echo "=== 2. Building Swift Native Shell ==="
mkdir -p "${SCRIPT_DIR}/.build"
BINARY="${SCRIPT_DIR}/.build/DSH"

# Compile all Swift files
swiftc -O \
  -module-cache-path "${TMPDIR:-/tmp}/swift-module-cache" \
  -parse-as-library \
  -o "${BINARY}" \
  "${SCRIPT_DIR}/Sources/DSHShell/main.swift" \
  "${SCRIPT_DIR}/Sources/DSHShell/AppDelegate.swift" \
  "${SCRIPT_DIR}/Sources/DSHShell/State/DshState.swift" \
  "${SCRIPT_DIR}/Sources/DSHShell/Service/NodeRuntime.swift" \
  "${SCRIPT_DIR}/Sources/DSHShell/Service/DshService.swift" \
  "${SCRIPT_DIR}/Sources/DSHShell/Versions/DshVersionManager.swift" \
  "${SCRIPT_DIR}/Sources/DSHShell/Plugins/DshPluginManager.swift" \
  "${SCRIPT_DIR}/Sources/DSHShell/Notification/NotificationManager.swift" \
  "${SCRIPT_DIR}/Sources/DSHShell/Bridge/DshBridgeHandler.swift" \
  "${SCRIPT_DIR}/Sources/DSHShell/About/AboutWindowController.swift" \
  "${SCRIPT_DIR}/Sources/DSHShell/MainWindow/CustomDragView.swift" \
  "${SCRIPT_DIR}/Sources/DSHShell/MainWindow/MainWindowController.swift" \
  "${SCRIPT_DIR}/Sources/DSHShell/SettingsUI/SettingsViewModel.swift" \
  "${SCRIPT_DIR}/Sources/DSHShell/SettingsUI/VersionsTabView.swift" \
  "${SCRIPT_DIR}/Sources/DSHShell/SettingsUI/PluginsTabView.swift" \
  "${SCRIPT_DIR}/Sources/DSHShell/SettingsUI/GeneralTabView.swift" \
  "${SCRIPT_DIR}/Sources/DSHShell/SettingsUI/AboutTabView.swift" \
  "${SCRIPT_DIR}/Sources/DSHShell/SettingsUI/SettingsView.swift" \
  "${SCRIPT_DIR}/Sources/DSHShell/SettingsUI/SettingsWindowController.swift" \
  -framework AppKit \
  -framework WebKit \
  -framework SwiftUI \
  -framework UserNotifications

echo "=== 3. Packaging Application Bundle ==="
APP_NAME="DSH"
APP_VERSION="$(${REPO_DIR}/assets/node/bin/node -p "require('${REPO_DIR}/package.json').version")"
APP_DIR="${REPO_DIR}/dist/swift/${APP_NAME}.app"
CONTENTS="${APP_DIR}/Contents"
MACOS_DIR="${CONTENTS}/MacOS"
RESOURCES_DIR="${CONTENTS}/Resources"

rm -rf "${APP_DIR}"
mkdir -p "${MACOS_DIR}" "${RESOURCES_DIR}"

cp "${BINARY}" "${MACOS_DIR}/${APP_NAME}"
chmod +x "${MACOS_DIR}/${APP_NAME}"

# Copy bundled Node.js runtime
mkdir -p "${RESOURCES_DIR}/node/bin"
if [ -f "${REPO_DIR}/assets/node/bin/node" ]; then
  cp "${REPO_DIR}/assets/node/bin/node" "${RESOURCES_DIR}/node/bin/node"
  chmod +x "${RESOURCES_DIR}/node/bin/node"
fi

# Copy bundled assets (pnpm, dsh-node, dsh-desktop-host)
mkdir -p "${RESOURCES_DIR}/assets"
if [ -f "${REPO_DIR}/assets/icon.icns" ]; then
  cp "${REPO_DIR}/assets/icon.icns" "${RESOURCES_DIR}/icon.icns"
fi
if [ -d "${REPO_DIR}/assets/bin" ]; then
  cp -R "${REPO_DIR}/assets/bin" "${RESOURCES_DIR}/assets/"
  chmod +x "${RESOURCES_DIR}/assets/bin/pnpm" "${RESOURCES_DIR}/assets/bin/dsh-node" || true
fi
if [ -d "${REPO_DIR}/assets/dsh-desktop-host" ]; then
  cp -R "${REPO_DIR}/assets/dsh-desktop-host" "${RESOURCES_DIR}/assets/"
fi

# Write Info.plist
cat > "${CONTENTS}/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>zh_CN</string>
	<key>CFBundleExecutable</key>
	<string>DSH</string>
	<key>CFBundleIdentifier</key>
	<string>io.github.krystal-cao.dsh-swift-shell</string>
	<key>CFBundleName</key>
	<string>DSH</string>
	<key>CFBundleDisplayName</key>
	<string>DeepSeek Harness</string>
	<key>CFBundleIconFile</key>
	<string>icon.icns</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>${APP_VERSION}</string>
	<key>CFBundleVersion</key>
	<string>${APP_VERSION}</string>
	<key>LSMinimumSystemVersion</key>
	<string>13.0</string>
	<key>NSHighResolutionCapable</key>
	<true/>
	<key>NSHumanReadableCopyright</key>
	<string>MIT License</string>
	<key>NSMainNibFile</key>
	<string></string>
	<key>NSPrincipalClass</key>
	<string>NSApplication</string>
</dict>
</plist>
EOF

echo "=== 4. Ad-hoc Codesigning ==="
codesign --force --deep --sign - --timestamp=none "${APP_DIR}"

echo "✅ Build completed successfully: ${APP_DIR}"
