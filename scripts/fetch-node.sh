#!/bin/bash
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-v22.23.1}"
NODE_SOURCE="${DSH_NODE_SOURCE:-auto}"
REQUESTED_ARCH="${DSH_NODE_ARCH:-$(uname -m)}"

DEST_DIR="$(cd "$(dirname "$0")/.." && pwd)/assets/node"
mkdir -p "$DEST_DIR/bin"

case "$REQUESTED_ARCH" in
  arm64)
    NODE_ARCHES=(arm64)
    ;;
  x86_64)
    NODE_ARCHES=(x64)
    ;;
  universal)
    NODE_ARCHES=(arm64 x64)
    ;;
  *)
    echo "Unsupported Node architecture: $REQUESTED_ARCH" >&2
    exit 1
    ;;
esac

case "$NODE_SOURCE" in
  auto|official)
    ;;
  *)
    echo "Unsupported DSH_NODE_SOURCE: $NODE_SOURCE (expected auto or official)" >&2
    exit 1
    ;;
esac

if [ "$NODE_SOURCE" = "auto" ] && [ "$REQUESTED_ARCH" != "universal" ] \
  && [ -f "$DEST_DIR/bin/node" ] && [ -x "$DEST_DIR/bin/node" ]; then
  echo "Bundled node already exists at $DEST_DIR/bin/node ($("$DEST_DIR/bin/node" --version))"
  exit 0
fi

if [ "$NODE_SOURCE" = "auto" ] && [ "$REQUESTED_ARCH" != "universal" ]; then
  # If system node is present, copy it for local development builds. Release
  # builds set DSH_NODE_SOURCE=official so the packaged runtime never depends
  # on the build machine's Node binary or deployment target.
  SYSTEM_NODE="$(which node || true)"
  if [ -n "$SYSTEM_NODE" ] && [ -x "$SYSTEM_NODE" ]; then
    echo "Copying system node from $SYSTEM_NODE..."
    cp "$SYSTEM_NODE" "$DEST_DIR/bin/node"
    chmod +x "$DEST_DIR/bin/node"
    echo "Copied system node ($("$DEST_DIR/bin/node" --version)) to $DEST_DIR/bin/node"
    exit 0
  fi
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if ! command -v curl >/dev/null 2>&1 || ! command -v tar >/dev/null 2>&1; then
  echo "Official Node downloads require curl and tar" >&2
  exit 1
fi

download_node() {
  local node_arch="$1"
  local tarball="node-${NODE_VERSION}-darwin-${node_arch}.tar.gz"
  local url="https://nodejs.org/dist/${NODE_VERSION}/${tarball}"
  local archive="$TMP_DIR/$tarball"
  local extracted="$TMP_DIR/node-${NODE_VERSION}-darwin-${node_arch}/bin/node"

  echo "Downloading official Node.js from $url..." >&2
  curl -fsSL "$url" -o "$archive"
  tar -xzf "$archive" -C "$TMP_DIR"
  if [ ! -x "$extracted" ]; then
    echo "Downloaded Node.js archive is missing its executable: $extracted" >&2
    exit 1
  fi
  printf '%s\n' "$extracted"
}

NODE_BINARIES=()
for node_arch in "${NODE_ARCHES[@]}"; do
  NODE_BINARIES+=("$(download_node "$node_arch")")
done

if [ "$REQUESTED_ARCH" = "universal" ]; then
  if ! command -v lipo >/dev/null 2>&1; then
    echo "Universal Node builds require lipo" >&2
    exit 1
  fi
  echo "Combining official Node.js arm64 and x64 binaries..."
  lipo -create "${NODE_BINARIES[0]}" "${NODE_BINARIES[1]}" -output "$DEST_DIR/bin/node"
else
  cp "${NODE_BINARIES[0]}" "$DEST_DIR/bin/node"
fi

chmod +x "$DEST_DIR/bin/node"

if [ "$NODE_SOURCE" = "official" ] \
  && { [ "$REQUESTED_ARCH" = "universal" ] || [ "$REQUESTED_ARCH" = "$(uname -m)" ]; }; then
  if ! "$DEST_DIR/bin/node" -e '
    const required = [
      ["Promise.withResolvers", typeof Promise.withResolvers === "function"],
      ["node:zlib.createZstdDecompress", typeof require("node:zlib").createZstdDecompress === "function"],
      ["node:module.stripTypeScriptTypes", typeof require("node:module").stripTypeScriptTypes === "function"],
    ];
    const missing = required.filter(([, available]) => !available).map(([name]) => name);
    if (missing.length) {
      console.error(`Missing Node.js runtime features: ${missing.join(", ")}`);
      process.exit(1);
    }
  '; then
    echo "Downloaded Node.js ${NODE_VERSION} does not satisfy the DSH runtime requirements" >&2
    exit 1
  fi
elif [ "$NODE_SOURCE" = "official" ]; then
  echo "Skipping runtime feature execution for cross-architecture Node.js (${REQUESTED_ARCH} on $(uname -m))."
fi

echo "Node.js ${NODE_VERSION} (${REQUESTED_ARCH}) installed to $DEST_DIR/bin/node"
