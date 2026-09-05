package com.rushingpoint.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private WebView webView;
    private static final int LOCATION_PERMISSION_REQUEST_CODE = 1001;

    // PRIMARY: Load live server — always up-to-date, real payments, latest UI
    private static final String LIVE_APP_URL = "https://rushpoint2.onrender.com/dual-console?view=mobile";

    // FALLBACK: Local bundled assets — offline mode (no API/payment)
    private static final String LOCAL_APP_URL = "file:///android_asset/www/index.html";

    private boolean liveLoadFailed = false;

    /** Check if the device has an active internet connection */
    private boolean isOnline() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            NetworkInfo net = cm.getActiveNetworkInfo();
            return net != null && net.isConnected();
        } catch (Exception e) {
            return false;
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Hardware acceleration for smooth scrolling and rendering
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);
        }

        // Match RushPoint maroon status/navigation bar theme
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Window window = getWindow();
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(Color.parseColor("#2B0008"));
            window.setNavigationBarColor(Color.parseColor("#1F0005"));
        }

        // Full screen immersive layout (content extends behind status bar)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            );
        }

        // Request runtime permissions on Android 6.0+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                        Manifest.permission.CAMERA
                }, LOCATION_PERMISSION_REQUEST_CODE);
            }
        }

        webView = new WebView(this);
        // Dark maroon background to avoid white flash while page loads
        webView.setBackgroundColor(Color.parseColor("#2B0008"));
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);

        // CRITICAL: proper mobile viewport prevents blank/white screen
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setLayoutAlgorithm(WebSettings.LayoutAlgorithm.NORMAL);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                // Keep all rushpoint/flutterwave URLs inside the WebView
                view.loadUrl(url);
                return true;
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                // If live server fails (no internet), fall back to local bundled app
                if (!liveLoadFailed && failingUrl != null && failingUrl.startsWith("https://")) {
                    liveLoadFailed = true;
                    view.loadUrl(LOCAL_APP_URL);
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                // Ensure proper viewport and full-screen fill after load
                view.evaluateJavascript(
                    "(function() {" +
                    "  var m = document.querySelector('meta[name=viewport]');" +
                    "  if(!m){m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);}" +
                    "  m.content='width=device-width,initial-scale=1.0,maximum-scale=5.0,viewport-fit=cover';" +
                    "  document.documentElement.style.height='100%';" +
                    "  document.body.style.height='100%';" +
                    "  document.body.style.margin='0';" +
                    "  document.body.style.padding='0';" +
                    "})();",
                    null
                );
            }
        });

        // ONLINE FIRST: load live server; fall back to local if offline
        if (isOnline()) {
            webView.loadUrl(LIVE_APP_URL);
        } else {
            liveLoadFailed = true;
            webView.loadUrl(LOCAL_APP_URL);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
