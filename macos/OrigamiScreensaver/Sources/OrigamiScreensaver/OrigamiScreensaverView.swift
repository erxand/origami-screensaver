import ScreenSaver
import WebKit

/// Main screensaver view — embeds the Vite-built web app in a WKWebView.
///
/// The screensaver bundle includes a `web/` resource folder (contents of `npm run build` dist/).
/// The WKWebView loads `index.html` from that folder via a file:// URL.
class OrigamiScreensaverView: ScreenSaverView {

    private var webView: WKWebView!

    // MARK: - Init

    override init?(frame: NSRect, isPreview: Bool) {
        super.init(frame: frame, isPreview: isPreview)
        setupWebView()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    // MARK: - Setup

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        // Allow JS to load local files
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        config.setValue(true, forKey: "allowUniversalAccessFromFileURLs")

        webView = WKWebView(frame: bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]

        // Disable scrollbars on the inner scroll view
        if let scrollView = webView.subviews.first as? NSScrollView {
            scrollView.hasHorizontalScroller = false
            scrollView.hasVerticalScroller = false
        }

        addSubview(webView)
        loadWebContent()
    }

    private func loadWebContent() {
        let bundle = Bundle(for: type(of: self))
        guard let indexURL = bundle.url(forResource: "index", withExtension: "html", subdirectory: "web") else {
            // Fallback: render error text directly
            let label = NSTextField(labelWithString: "origami-screensaver: web/index.html not found in bundle.\nRun `npm run build` and copy dist/ to macos/web/ before bundling.")
            label.textColor = .white
            label.alignment = .center
            label.frame = bounds
            addSubview(label)
            return
        }

        // Load from file URL — WKWebView resolves relative assets (JS, CSS) against this directory
        webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
    }

    // MARK: - ScreenSaverView overrides

    override func startAnimation() {
        super.startAnimation()
        // JS requestAnimationFrame loop starts automatically when page loads
    }

    override func stopAnimation() {
        super.stopAnimation()
        // Signal the JS screensaver to stop its rAF loop (optional — WebKit pauses it anyway)
        webView.evaluateJavaScript("if (window.__screensaver) window.__screensaver.stop();", completionHandler: nil)
    }

    override func draw(_ rect: NSRect) {
        // WKWebView handles all drawing; fill background black during load
        NSColor.black.setFill()
        rect.fill()
    }

    // MARK: - Configuration sheet (none)

    override var hasConfigureSheet: Bool { false }
    override var configureSheet: NSWindow? { nil }
}
