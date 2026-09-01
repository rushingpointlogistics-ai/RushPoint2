import UIKit
import WebKit
import CoreLocation

class ViewController: UIViewController, WKUIDelegate, WKNavigationDelegate, CLLocationManagerDelegate {
    private var webView: WKWebView!
    private var locationManager: CLLocationManager?

    override func viewDidLoad() {
        super.viewDidLoad()
        setupLocationManager()
        setupWebView()
        loadApp()
    }

    private func setupLocationManager() {
        locationManager = CLLocationManager()
        locationManager?.delegate = self
        locationManager?.requestWhenInUseAuthorization()
    }

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.javaScriptEnabled = true

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.uiDelegate = self
        webView.navigationDelegate = self
        view.addSubview(webView)
    }

    private func loadApp() {
        // Load bundled app.html with fallback
        if let bundleUrl = Bundle.main.url(forResource: "app", withExtension: "html", subdirectory: "www") {
            webView.loadFileURL(bundleUrl, allowingReadAccessTo: bundleUrl.deletingLastPathComponent())
        } else if let remoteUrl = URL(string: "https://rushingpoint.com/app") {
            let request = URLRequest(url: remoteUrl)
            webView.load(request)
        }
    }
}
