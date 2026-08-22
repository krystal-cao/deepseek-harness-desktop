#!/bin/bash
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-v20.18.0}"
ARCH="$(uname -m)"
if [ "$ARCH" = "x86_64" ]; then
  NODE_ARCH="x64"
elif [ "$ARCH" = "arm64" ]; then
  NODE_ARCH="arm64"
else
  echo "Unsupported architecture: $ARCH"
  exit 1
fi

DEST_DIR="$(cd "$(dirname "$0")/.." && pwd)/assets/node"
mkdir -p "$DEST_DIR/bin"

if [ -f "$DEST_DIR/bin/node" ] && [ -x "$DEST_DIR/bin/node" ]; then
  echo "Bundled node already exists at $DEST_DIR/bin/node ($("$DEST_DIR/bin/node" --version))"
  exit 0
fi

# If system node is present, copy it for local development build
SYSTEM_NODE="$(which node || true)"
if [ -n "$SYSTEM_NODE" ] && [ -x "$SYSTEM_NODE" ]; then
  echo "Copying system node from $SYSTEM_NODE..."
  cp "$SYSTEM_NODE" "$DEST_DIR/bin/node"
  chmod +x "$DEST_DIR/bin/node"
  echo "Copied system node ($("$DEST_DIR/bin/node" --version)) to $DEST_DIR/bin/node"
  exit 0
fi

# Otherwise download official Node binary
TARBALL="node-${NODE_VERSION}-darwin-${NODE_ARCH}.tar.gz"
URL="https://nodejs.org/dist/${NODE_VERSION}/${TARBALL}"
echo "Downloading Node.js from $URL..."
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

curl -fsSL "$URL" -o "$TMP_DIR/$TARBALL"
tar -xzf "$TMP_DIR/$TARBALL" -C "$TMP_DIR"
cp "$TMP_DIR/node-${NODE_VERSION}-darwin-${NODE_ARCH}/bin/node" "$DEST_DIR/bin/node"
chmod +x "$DEST_DIR/bin/node"

echo "Node.js ${NODE_VERSION} downloaded to $DEST_DIR/bin/node"
