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

export MACOSX_DEPLOYMENT_TARGET="${DEPLOYMENT_TARGET}"

APP_NAME="DSH"
SWIFT_VERSION_CONFIG="${SCRIPT_DIR}/Version.xcconfig"
APP_VERSION="$(sed -nE 's/^[[:space:]]*SWIFT_APP_VERSION[[:space:]]*=[[:space:]]*([^[:space:]]+).*/\1/p' "${SWIFT_VERSION_CONFIG}" | head -n 1)"
DIST_DIR="${REPO_DIR}/dist/swift"
APP_ICON_SOURCE="${SCRIPT_DIR}/app.icon"
APP_ICON_NAME="app"
SWIFT_ASSETS_DIR="${SCRIPT_DIR}/assets"
DSH_FAMILY_MANIFEST_SOURCE="${SWIFT_ASSETS_DIR}/dsh-family.json"
SWIFT_BRIDGE_SOURCE="${SWIFT_ASSETS_DIR}/dsh-desktop-host"

if [ ! -d "${APP_ICON_SOURCE}" ] || [ ! -s "${APP_ICON_SOURCE}/icon.json" ] || [ ! -s "${APP_ICON_SOURCE}/Assets/icon-1024.png" ]; then
	echo "Application Icon Composer file is missing or incomplete: ${APP_ICON_SOURCE}" >&2
	exit 1
fi
if [ ! -s "${DSH_FAMILY_MANIFEST_SOURCE}" ]; then
	echo "DSH family manifest is missing or empty: ${DSH_FAMILY_MANIFEST_SOURCE}" >&2
	exit 1
fi
if [ ! -d "${SWIFT_BRIDGE_SOURCE}" ] || [ ! -s "${SWIFT_BRIDGE_SOURCE}/package.json" ] || [ ! -s "${SWIFT_BRIDGE_SOURCE}/index.js" ] || [ ! -s "${SWIFT_BRIDGE_SOURCE}/client.js" ] || [ ! -s "${SWIFT_BRIDGE_SOURCE}/cordis.patch.yml" ]; then
	echo "Swift bridge plugin is incomplete: ${SWIFT_BRIDGE_SOURCE}" >&2
	exit 1
fi
if [ -z "${APP_VERSION}" ]; then
	echo "Swift application version is missing: ${SWIFT_VERSION_CONFIG}" >&2
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
	echo "=== ${BUILD_ARCH} 1/3: Preparing Node.js Runtime ==="
	DSH_NODE_SOURCE="${DSH_NODE_SOURCE:-official}" DSH_NODE_ARCH="${BUILD_ARCH}" bash "${SCRIPT_DIR}/fetch-node.sh"
	NODE_BINARY="${SWIFT_ASSETS_DIR}/node/bin/node"
	validate_thin_architecture "${NODE_BINARY}" "${BUILD_ARCH}"

	echo "=== ${BUILD_ARCH} 2/3: Building Swift Native Shell ==="
	APP_PARENT_DIR="${DIST_DIR}/${BUILD_ARCH}"
	APP_DIR="${APP_PARENT_DIR}/${APP_NAME}.app"
	DERIVED_DATA_DIR="${SCRIPT_DIR}/.build/xcode/${BUILD_ARCH}"
	BUILT_APP_DIR="${DERIVED_DATA_DIR}/Build/Products/Release/${APP_NAME}.app"
	rm -rf "${APP_PARENT_DIR}" "${DERIVED_DATA_DIR}"
	mkdir -p "${APP_PARENT_DIR}"
	xcodebuild \
		-project "${SCRIPT_DIR}/DSH.xcodeproj" \
		-scheme "${APP_NAME}" \
		-configuration Release \
		-sdk macosx \
		-derivedDataPath "${DERIVED_DATA_DIR}" \
		ARCHS="${BUILD_ARCH}" \
		ONLY_ACTIVE_ARCH=NO \
		MARKETING_VERSION="${APP_VERSION}" \
		CURRENT_PROJECT_VERSION="${APP_VERSION}" \
		MACOSX_DEPLOYMENT_TARGET="${DEPLOYMENT_TARGET}" \
		CODE_SIGNING_ALLOWED=NO \
		CODE_SIGNING_REQUIRED=NO \
		build

	if [ ! -d "${BUILT_APP_DIR}" ]; then
		echo "Xcode did not produce the Swift application bundle: ${BUILT_APP_DIR}" >&2
		exit 1
	fi
	# Keep the copy semantics used by the legacy packager. `ditto` can fail on
	# Finder metadata files that may be present in bundled runtime assets.
	COPYFILE_DISABLE=1 cp -R "${BUILT_APP_DIR}" "${APP_DIR}"

	APP_BINARY="${APP_DIR}/Contents/MacOS/${APP_NAME}"
	if [ ! -x "${APP_BINARY}" ]; then
		echo "Xcode did not produce the Swift application binary: ${APP_BINARY}" >&2
		exit 1
	fi
	validate_thin_architecture "${APP_BINARY}" "${BUILD_ARCH}"

	BUILD_LOAD_COMMANDS="$(otool -l "${APP_BINARY}")"
	if ! printf '%s\n' "${BUILD_LOAD_COMMANDS}" | grep -F "minos ${DEPLOYMENT_TARGET}" >/dev/null; then
		echo "Swift binary does not advertise the requested minimum macOS ${DEPLOYMENT_TARGET}" >&2
		printf '%s\n' "${BUILD_LOAD_COMMANDS}" | grep -A3 'LC_BUILD_VERSION' >&2 || true
		exit 1
	fi

	RESOURCES_DIR="${APP_DIR}/Contents/Resources"
	if [ ! -s "${RESOURCES_DIR}/Assets.car" ]; then
		echo "Application icon resources were not compiled: ${RESOURCES_DIR}/Assets.car" >&2
		exit 1
	fi
	if [ ! -s "${RESOURCES_DIR}/${APP_ICON_NAME}.icns" ]; then
		echo "Application icon was not emitted by Xcode: ${RESOURCES_DIR}/${APP_ICON_NAME}.icns" >&2
		exit 1
	fi
	if ! cmp -s "${DSH_FAMILY_MANIFEST_SOURCE}" "${RESOURCES_DIR}/assets/dsh-family.json"; then
		echo "DSH family manifest was not copied correctly" >&2
		exit 1
	fi
	validate_thin_architecture "${RESOURCES_DIR}/node/bin/node" "${BUILD_ARCH}"
	if [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconName' "${APP_DIR}/Contents/Info.plist")" != "${APP_ICON_NAME}" ]; then
		echo "Info.plist does not reference the packaged application icon" >&2
		exit 1
	fi

	echo "=== ${BUILD_ARCH} 3/3: Ad-hoc Codesigning ==="
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
