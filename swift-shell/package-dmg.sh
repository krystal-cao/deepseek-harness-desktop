#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

APP_NAME="DSH"
SWIFT_VERSION_CONFIG="${SCRIPT_DIR}/Version.xcconfig"
APP_VERSION="$(sed -nE 's/^[[:space:]]*SWIFT_APP_VERSION[[:space:]]*=[[:space:]]*([^[:space:]]+).*/\1/p' "${SWIFT_VERSION_CONFIG}" | head -n 1)"
DIST_DIR="${REPO_DIR}/dist/swift"
VOLUME_NAME="DSH Desktop ${APP_VERSION}"

if [ -z "${APP_VERSION}" ]; then
	echo "Swift application version is missing: ${SWIFT_VERSION_CONFIG}" >&2
	exit 1
fi

if [ -n "${DSH_BUILD_ARCHES:-}" ]; then
	read -r -a PACKAGE_ARCHES <<< "${DSH_BUILD_ARCHES}"
elif [ -n "${DSH_BUILD_ARCH:-}" ]; then
	PACKAGE_ARCHES=("${DSH_BUILD_ARCH}")
else
	PACKAGE_ARCHES=(arm64 x86_64)
fi

for PACKAGE_ARCH in "${PACKAGE_ARCHES[@]}"; do
	case "${PACKAGE_ARCH}" in
		arm64)
			ARTIFACT_ARCH="arm64"
			;;
		x86_64)
			ARTIFACT_ARCH="x64"
			;;
		*)
			echo "Unsupported package architecture: ${PACKAGE_ARCH}" >&2
			exit 1
			;;
	esac

	APP_DIR="${DIST_DIR}/${PACKAGE_ARCH}/${APP_NAME}.app"
	APP_BINARY="${APP_DIR}/Contents/MacOS/${APP_NAME}"
	DMG_PATH="${DIST_DIR}/DSH-Desktop-${APP_VERSION}-${ARTIFACT_ARCH}.dmg"

	if [ ! -d "${APP_DIR}" ] || [ ! -x "${APP_BINARY}" ]; then
		echo "Swift application bundle is missing for ${PACKAGE_ARCH}: ${APP_DIR}" >&2
		echo "Run npm run build:swift:${PACKAGE_ARCH} first, or use an npm dist:swift command." >&2
		exit 1
	fi

	ACTUAL_ARCH="$(lipo -archs "${APP_BINARY}")"
	if [ "${ACTUAL_ARCH}" != "${PACKAGE_ARCH}" ]; then
		echo "Expected ${APP_BINARY} to contain only ${PACKAGE_ARCH}, found: ${ACTUAL_ARCH}" >&2
		exit 1
	fi

	codesign --verify --deep --strict "${APP_DIR}"

	STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/dsh-swift-dmg.XXXXXX")"
	cleanup() {
		rm -rf "${STAGING_DIR}"
	}
	trap cleanup EXIT

	# Finder metadata is not needed in the image and can carry restricted
	# provenance attributes from locally built dependencies.
	COPYFILE_DISABLE=1 cp -R "${APP_DIR}" "${STAGING_DIR}/${APP_NAME}.app"
	codesign --verify --deep --strict "${STAGING_DIR}/${APP_NAME}.app"
	ln -s /Applications "${STAGING_DIR}/Applications"

	echo "Creating ${ARTIFACT_ARCH} DMG: ${DMG_PATH}"
	hdiutil create \
		-volname "${VOLUME_NAME}" \
		-srcfolder "${STAGING_DIR}" \
		-ov \
		-format UDZO \
		-imagekey zlib-level=9 \
		"${DMG_PATH}"
	hdiutil verify "${DMG_PATH}"

	cleanup
	trap - EXIT
	echo "✅ ${ARTIFACT_ARCH} DMG completed: ${DMG_PATH}"
done
