#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PNPM_VERSION="${DSH_PNPM_VERSION:-11.22.0}"
PNPM_SHA512="${DSH_PNPM_SHA512:-1ff870c4c6133dfd88fb2afc46dd13d47f09c9794b438c6fdb47ca98caf3bc16381ee0be93a091b8e3824cf01f889f46d7d9e20910fb0be1ab0fb5baa80dd621}"
DEST_DIR="${SCRIPT_DIR}/assets/bin/pnpm-pkg"

installed_version=""
if [ -f "${DEST_DIR}/package.json" ] && [ -f "${DEST_DIR}/bin/pnpm.cjs" ]; then
	installed_version="$(sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "${DEST_DIR}/package.json" | head -n 1)"
fi
if [ "${installed_version}" = "${PNPM_VERSION}" ]; then
	echo "Bundled pnpm ${PNPM_VERSION} already exists at ${DEST_DIR}"
	exit 0
fi

if ! command -v curl >/dev/null 2>&1 || ! command -v tar >/dev/null 2>&1; then
	echo "Preparing Swift pnpm requires curl and tar" >&2
	exit 1
fi

if command -v shasum >/dev/null 2>&1; then
	sha512_file() { shasum -a 512 "$1" | awk '{print $1}'; }
elif command -v sha512sum >/dev/null 2>&1; then
	sha512_file() { sha512sum "$1" | awk '{print $1}'; }
else
	echo "Preparing Swift pnpm requires shasum or sha512sum" >&2
	exit 1
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/dsh-pnpm.XXXXXX")"
trap 'rm -rf "${TMP_DIR}"' EXIT
ARCHIVE="${TMP_DIR}/pnpm-${PNPM_VERSION}.tgz"

if [ -n "${DSH_PNPM_TARBALL_URL:-}" ]; then
	PNPM_URLS=("${DSH_PNPM_TARBALL_URL}")
else
	PNPM_URLS=(
		"https://registry.npmjs.org/pnpm/-/pnpm-${PNPM_VERSION}.tgz"
		"https://cdn.npmmirror.com/packages/pnpm/${PNPM_VERSION}/pnpm-${PNPM_VERSION}.tgz"
	)
fi

downloaded=0
for pnpm_url in "${PNPM_URLS[@]}"; do
	echo "Downloading pnpm ${PNPM_VERSION} from ${pnpm_url}..."
	rm -f "${ARCHIVE}"
	if curl -fsSL "${pnpm_url}" -o "${ARCHIVE}"; then
		downloaded=1
		break
	fi
done
if [ "${downloaded}" -ne 1 ]; then
	echo "Unable to download pnpm ${PNPM_VERSION}" >&2
	exit 1
fi

actual_sha512="$(sha512_file "${ARCHIVE}")"
if [ "${actual_sha512}" != "${PNPM_SHA512}" ]; then
	echo "pnpm ${PNPM_VERSION} checksum mismatch" >&2
	echo "Expected: ${PNPM_SHA512}" >&2
	echo "Actual:   ${actual_sha512}" >&2
	exit 1
fi

tar -xzf "${ARCHIVE}" -C "${TMP_DIR}"
EXTRACTED_DIR="${TMP_DIR}/package"
if [ ! -f "${EXTRACTED_DIR}/package.json" ] || [ ! -f "${EXTRACTED_DIR}/bin/pnpm.cjs" ]; then
	echo "Downloaded pnpm archive has an unexpected layout" >&2
	exit 1
fi

extracted_version="$(sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "${EXTRACTED_DIR}/package.json" | head -n 1)"
if [ "${extracted_version}" != "${PNPM_VERSION}" ]; then
	echo "Downloaded pnpm archive reports version ${extracted_version}, expected ${PNPM_VERSION}" >&2
	exit 1
fi

mkdir -p "$(dirname "${DEST_DIR}")"
rm -rf "${DEST_DIR}"
mv "${EXTRACTED_DIR}" "${DEST_DIR}"
echo "Prepared pnpm ${PNPM_VERSION} at ${DEST_DIR}"
