# macOS Screensaver Bundle

This directory contains the WKWebView wrapper for packaging the origami screensaver as a native macOS `.saver` bundle.

## Architecture

```
macos/
├── OrigamiScreensaver/
│   └── Sources/OrigamiScreensaver/
│       └── OrigamiScreensaverView.swift  — WKWebView subclass of ScreenSaverView
├── Info.plist                             — Bundle metadata (CFBundlePrincipalClass etc.)
├── build.sh                               — One-shot build script
└── README.md                              — This file
```

### How it works

1. `npm run build` compiles the TypeScript source → `dist/` (static HTML + JS)
2. `build.sh` compiles the Swift wrapper with `swiftc` and assembles a `.saver` bundle:
   - `Contents/MacOS/OrigamiScreensaver` — the compiled Swift dylib
   - `Contents/Resources/web/` — the Vite build output (index.html + assets/)
   - `Contents/Info.plist` — bundle metadata
3. `OrigamiScreensaverView` loads `web/index.html` from the bundle via a `file://` URL
4. WebKit's JavaScript engine runs the screensaver's `requestAnimationFrame` loop natively

## Requirements

- **Xcode** installed (not just Command Line Tools) — needed for `ScreenSaver.framework`
- **macOS 12+** (Monterey or later) — WKWebView with local file access
- **Node.js 18+** — for the Vite build step

## Build & Install

```bash
cd macos/
./build.sh
```

This produces `macos/OrigamiScreensaver.saver`.

**Install for current user:**
```bash
cp -r macos/OrigamiScreensaver.saver ~/Library/Screen\ Savers/
open "x-apple.systempreferences:com.apple.preference.desktopscreensaver"
```

**Install system-wide (requires admin):**
```bash
sudo cp -r macos/OrigamiScreensaver.saver /Library/Screen\ Savers/
```

## Notes

- The Swift source is compiled with `swiftc` directly (no Xcode project file needed)
- Target: `arm64-apple-macos12.0` — Apple Silicon only; add `-target x86_64-apple-macos12.0` and use `lipo` for a universal binary
- The screensaver has no configuration sheet (`hasConfigureSheet = false`) — all params are baked in
- If the web app needs to detect it's running in screensaver mode, check `window.location.protocol === 'file:'`

## Adding URL params

To configure the screensaver (palette, speed, etc.), edit the `loadWebContent()` function in `OrigamiScreensaverView.swift` to append URL params before loading:

```swift
// Example: use ocean palette, 1.5x speed
let paramsURL = indexURL.absoluteString + "?palette=ocean&speed=1.5"
webView.load(URLRequest(url: URL(string: paramsURL)!))
```
