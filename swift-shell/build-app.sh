#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DEPLOYMENT_TARGET="${MACOSX_DEPLOYMENT_TARGET:-13.0}"
if [ -n "${DSH_BUILD_ARCHES:-}" ]; then
	read -r -a BUILD_ARCHES <<< "${DSH_BUILD_ARCHES}"
elif [ -n "${DSH_BUILD_ARCH:-}" ]; then
	BUILD_ARCHES=("${DSH_BUILD_ARCH}")
else
	case "$(uname -m)" in
		arm64) BUILD_ARCHES=(x86_64 arm64) ;;
		x86_64) BUILD_ARCHES=(arm64 x86_64) ;;
		*)
			echo "Unsupported build host architecture: $(uname -m)" >&2
			exit 1
			;;
	esac
fi

for BUILD_ARCH in "${BUILD_ARCHES[@]}"; do
	case "${BUILD_ARCH}" in
		arm64|x86_64) ;;
		*)
			echo "Unsupported build architecture: ${BUILD_ARCH}" >&2
			exit 1
			;;
	esac
done

mkdir -p "${SCRIPT_DIR}/.build"
export MACOSX_DEPLOYMENT_TARGET="${DEPLOYMENT_TARGET}"

SWIFT_SOURCES=(
	"${SCRIPT_DIR}/Sources/DSHShell/main.swift"
	"${SCRIPT_DIR}/Sources/DSHShell/AppDelegate.swift"
	"${SCRIPT_DIR}/Sources/DSHShell/State/DshState.swift"
	"${SCRIPT_DIR}/Sources/DSHShell/Service/NodeRuntime.swift"
	"${SCRIPT_DIR}/Sources/DSHShell/Versions/DshSemanticVersion.swift"
	"${SCRIPT_DIR}/Sources/DSHShell/Service/DshService.swift"
	"${SCRIPT_DIR}/Sources/DSHShell/Versions/DshVersionManager.swift"
	"${SCRIPT_DIR}/Sources/DSHShell/Plugins/DshPluginManager.swift"
	"${SCRIPT_DIR}/Sources/DSHShell/Notification/NotificationManager.swift"
	"${SCRIPT_DIR}/Sources/DSHShell/Bridge/DshBridgeHandler.swift"
	"${SCRIPT_DIR}/Sources/DSHShell/About/AboutWindowController.swift"
	"${SCRIPT_DIR}/Sources/DSHShell/MainWindow/CustomDragView.swift"
	"${SCRIPT_DIR}/Sources/DSHShell/MainWindow/MainWindowController.swift"
	"${SCRIPT_DIR}/Sources/DSHShell/SettingsUI/SettingsViewModel.swift"
	"${SCRIPT_DIR}/Sources/DSHShell/SettingsUI/VersionsTabView.swift"
	"${SCRIPT_DIR}/Sources/DSHShell/SettingsUI/PluginsTabView.swift"
	"${SCRIPT_DIR}/Sources/DSHShell/SettingsUI/GeneralTabView.swift"
	"${SCRIPT_DIR}/Sources/DSHShell/SettingsUI/AboutTabView.swift"
	"${SCRIPT_DIR}/Sources/DSHShell/SettingsUI/SettingsView.swift"
	"${SCRIPT_DIR}/Sources/DSHShell/SettingsUI/SettingsWindowController.swift"
)

APP_NAME="DSH"
APP_VERSION="$(plutil -extract version raw "${REPO_DIR}/package.json")"
DIST_DIR="${REPO_DIR}/dist/swift"
APP_ICON_SOURCE="${REPO_DIR}/assets/icon.icns"
APP_ICON_NAME="DSH.icns"
DSH_FAMILY_MANIFEST_SOURCE="${REPO_DIR}/assets/dsh-family.json"

if [ ! -s "${APP_ICON_SOURCE}" ]; then
	echo "Application icon is missing or empty: ${APP_ICON_SOURCE}" >&2
	exit 1
fi
if [ ! -s "${DSH_FAMILY_MANIFEST_SOURCE}" ]; then
	echo "DSH family manifest is missing or empty: ${DSH_FAMILY_MANIFEST_SOURCE}" >&2
	exit 1
fi

validate_thin_architecture() {
	local binary_path="$1"
	local expected_arch="$2"
	local actual_arch
	actual_arch="$(lipo -archs "${binary_path}")"
	if [ "${actual_arch}" != "${expected_arch}" ]; then
		echo "Expected ${binary_path} to contain only ${expected_arch}, found: ${actual_arch}" >&2
		exit 1
	fi
}

mkdir -p "${DIST_DIR}"
BUILT_APPS=()

for BUILD_ARCH in "${BUILD_ARCHES[@]}"; do
	echo "=== ${BUILD_ARCH} 1/4: Preparing Node.js Runtime ==="
	DSH_NODE_SOURCE=official DSH_NODE_ARCH="${BUILD_ARCH}" bash "${REPO_DIR}/scripts/fetch-node.sh"
	NODE_BINARY="${REPO_DIR}/assets/node/bin/node"
	validate_thin_architecture "${NODE_BINARY}" "${BUILD_ARCH}"

	echo "=== ${BUILD_ARCH} 2/4: Building Swift Native Shell ==="
	ARCH_BINARY="${SCRIPT_DIR}/.build/DSH-${BUILD_ARCH}"
	swiftc -O \
		-target "${BUILD_ARCH}-apple-macosx${DEPLOYMENT_TARGET}" \
		-module-cache-path "${TMPDIR:-/tmp}/swift-module-cache" \
		-parse-as-library \
		-o "${ARCH_BINARY}" \
		"${SWIFT_SOURCES[@]}" \
		-framework AppKit \
		-framework WebKit \
		-framework SwiftUI \
		-framework UserNotifications
	validate_thin_architecture "${ARCH_BINARY}" "${BUILD_ARCH}"

	BUILD_LOAD_COMMANDS="$(otool -l "${ARCH_BINARY}")"
	if ! printf '%s\n' "${BUILD_LOAD_COMMANDS}" | grep -F "minos ${DEPLOYMENT_TARGET}" >/dev/null; then
		echo "Swift binary does not advertise the requested minimum macOS ${DEPLOYMENT_TARGET}" >&2
		printf '%s\n' "${BUILD_LOAD_COMMANDS}" | grep -A3 'LC_BUILD_VERSION' >&2 || true
		exit 1
	fi

	echo "=== ${BUILD_ARCH} 3/4: Packaging Application Bundle ==="
	APP_DIR="${DIST_DIR}/${BUILD_ARCH}/${APP_NAME}.app"
	CONTENTS="${APP_DIR}/Contents"
	MACOS_DIR="${CONTENTS}/MacOS"
	RESOURCES_DIR="${CONTENTS}/Resources"
	APP_ICON_DESTINATION="${RESOURCES_DIR}/${APP_ICON_NAME}"

	rm -rf "${APP_DIR}"
	mkdir -p "${MACOS_DIR}" "${RESOURCES_DIR}/node/bin" "${RESOURCES_DIR}/assets"

	cp "${ARCH_BINARY}" "${MACOS_DIR}/${APP_NAME}"
	chmod +x "${MACOS_DIR}/${APP_NAME}"
	cp "${NODE_BINARY}" "${RESOURCES_DIR}/node/bin/node"
	chmod +x "${RESOURCES_DIR}/node/bin/node"
	validate_thin_architecture "${RESOURCES_DIR}/node/bin/node" "${BUILD_ARCH}"

	cp "${APP_ICON_SOURCE}" "${APP_ICON_DESTINATION}"
	if ! cmp -s "${APP_ICON_SOURCE}" "${APP_ICON_DESTINATION}"; then
		echo "Application icon was not copied correctly" >&2
		exit 1
	fi
	cp "${DSH_FAMILY_MANIFEST_SOURCE}" "${RESOURCES_DIR}/assets/dsh-family.json"
	if ! cmp -s "${DSH_FAMILY_MANIFEST_SOURCE}" "${RESOURCES_DIR}/assets/dsh-family.json"; then
		echo "DSH family manifest was not copied correctly" >&2
		exit 1
	fi
	if [ -d "${REPO_DIR}/assets/bin" ]; then
		cp -R "${REPO_DIR}/assets/bin" "${RESOURCES_DIR}/assets/"
		chmod +x "${RESOURCES_DIR}/assets/bin/pnpm" "${RESOURCES_DIR}/assets/bin/dsh-node" || true
	fi
	if [ -d "${REPO_DIR}/assets/dsh-desktop-host" ]; then
		cp -R "${REPO_DIR}/assets/dsh-desktop-host" "${RESOURCES_DIR}/assets/"
	fi

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
	<string>${APP_ICON_NAME}</string>
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

	if [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconFile' "${CONTENTS}/Info.plist")" != "${APP_ICON_NAME}" ]; then
		echo "Info.plist does not reference the packaged application icon" >&2
		exit 1
	fi

	echo "=== ${BUILD_ARCH} 4/4: Ad-hoc Codesigning ==="
	codesign --force --deep --sign - --timestamp=none "${APP_DIR}"
	touch "${APP_DIR}"
	BUILT_APPS+=("${APP_DIR}")
	echo "✅ ${BUILD_ARCH} build completed: ${APP_DIR}"
done

LEGACY_UNIVERSAL_APP="${DIST_DIR}/${APP_NAME}.app"
if [ -d "${LEGACY_UNIVERSAL_APP}" ]; then
	rm -rf "${LEGACY_UNIVERSAL_APP}"
fi

echo "Built architecture-specific application bundles:"
printf '  %s\n' "${BUILT_APPS[@]}"
