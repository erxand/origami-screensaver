#!/usr/bin/env bash
# Build script for OrigamiScreensaver.saver bundle.
#
# Prerequisites:
#   - Xcode installed (xcodebuild available)
#   - Node.js + npm (to build the web app)
#
# Usage:
#   cd macos/
#   ./build.sh
#
# Output:
#   OrigamiScreensaver.saver  — install to ~/Library/Screen Savers/
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
SAVER_NAME="OrigamiScreensaver"
BUILD_DIR="$SCRIPT_DIR/build"
SAVER_OUT="$SCRIPT_DIR/${SAVER_NAME}.saver"

echo "=== Step 1: Build web app ==="
cd "$REPO_ROOT"
npm install
npm run build
echo "Web app built → dist/"

echo ""
echo "=== Step 2: Compile Swift bundle ==="
mkdir -p "$BUILD_DIR"

# Compile Swift sources into a dylib / loadable bundle
SWIFT_SOURCES=(
    "$SCRIPT_DIR/OrigamiScreensaver/Sources/OrigamiScreensaver/OrigamiScreensaverView.swift"
)

swiftc \
    -module-name "$SAVER_NAME" \
    -emit-library \
    -emit-module \
    -module-link-name "$SAVER_NAME" \
    -target arm64-apple-macos12.0 \
    -sdk "$(xcrun --show-sdk-path)" \
    -framework ScreenSaver \
    -framework WebKit \
    -framework AppKit \
    -framework Foundation \
    -Xlinker -bundle \
    -o "$BUILD_DIR/${SAVER_NAME}" \
    "${SWIFT_SOURCES[@]}"

echo "Swift compiled → $BUILD_DIR/${SAVER_NAME}"

echo ""
echo "=== Step 3: Assemble .saver bundle ==="
rm -rf "$SAVER_OUT"
mkdir -p "$SAVER_OUT/Contents/MacOS"
mkdir -p "$SAVER_OUT/Contents/Resources/web"

# Copy binary
cp "$BUILD_DIR/${SAVER_NAME}" "$SAVER_OUT/Contents/MacOS/${SAVER_NAME}"

# Copy Info.plist
cp "$SCRIPT_DIR/Info.plist" "$SAVER_OUT/Contents/Info.plist"

# Copy built web app (dist/ contents) into bundle
cp -r "$REPO_ROOT/dist/." "$SAVER_OUT/Contents/Resources/web/"

echo "Bundle assembled → $SAVER_OUT"

echo ""
echo "=== Done! ==="
echo ""
echo "To install:"
echo "  cp -r '$SAVER_OUT' ~/Library/Screen\ Savers/"
echo "  open 'x-apple.systempreferences:com.apple.preference.desktopscreensaver'"
echo ""
echo "To install system-wide (requires admin):"
echo "  sudo cp -r '$SAVER_OUT' /Library/Screen\ Savers/"
