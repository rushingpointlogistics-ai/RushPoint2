# RUSHINGPOINT V1.0 — COMPLETE MOBILE APPS (ANDROID & IOS) RELEASE & HOSTING GUIDE

This guide provides end-to-end instructions for releasing the **Customer**, **Vendor**, and **Rider** native mobile apps for **Android (Google Play Store / APK)** and **Apple iOS (App Store / IPA)**, as well as hosting the **Admin Operations Web Portal** online.

---

## 📱 Mobile Architecture: Single Codebase, 3 Native Apps

RushingPoint uses a modern, responsive web core that packages into 3 distinct native mobile apps using **Capacitor (by Ionic)** or **Flutter WebView**:

| App | App ID / Bundle Identifier | Purpose | Key Permissions |
|---|---|---|---|
| 🛍️ **RushingPoint Customer** | `com.rushingpoint.customer` | Marketplace, Cart, Tracking, Logistics, Escrow Wallet | Geolocation, Notifications |
| 🏪 **RushingPoint Merchant** | `com.rushingpoint.vendor` | Storefronts, Bulk Inventory, Order Processing, Payouts | Camera (Product Photos), Notifications |
| 🛵 **RushingPoint Rider** | `com.rushingpoint.rider` | Fleet GPS Radar, Live Delivery Queue, POD OTP, Waybills | Background GPS, Camera (Waybill Scan) |
| 👑 **Admin Console** | `https://admin.yourdomain.com` | Centralized Web Portal (Desktop Browser Only) | Admin Role Security PIN & 2FA |

---

## 🛠️ Step 1: Packaging Mobile Apps with Capacitor

### Prerequisites
1. **Node.js 18+** installed (`node -v`)
2. **Android Studio** (for Android APK / Google Play .aab build)
3. **Xcode & macOS** (for iOS .ipa / Apple App Store build)

### 1. Initialize Capacitor Project
In your project directory, run:
```bash
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios @capacitor/geolocation @capacitor/camera @capacitor/push-notifications
npx cap init "RushingPoint" "com.rushingpoint.app" --web-dir "app/static"
```

### 2. Configure Capacitor for Production (`capacitor.config.json`)
```json
{
  "appId": "com.rushingpoint.customer",
  "appName": "RushingPoint",
  "webDir": "app/static",
  "bundledWebRuntime": false,
  "server": {
    "url": "https://api.yourdomain.com",
    "cleartext": false
  },
  "plugins": {
    "PushNotifications": {
      "presentationOptions": ["badge", "sound", "alert"]
    }
  }
}
```

---

## 🤖 Step 2: Building Android APK & Google Play Bundle (.aab)

### 1. Add Android Platform
```bash
npx cap add android
npx cap copy android
npx cap open android
```

### 2. Configure Android Permissions (`android/app/src/main/AndroidManifest.xml`)
Add the required permissions inside `<manifest>`:
```xml
<!-- Internet & Network -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<!-- GPS Geolocation for Live Tracking & Radar -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />

<!-- Camera & Storage for Product Photos & Proof of Delivery -->
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
```

### 3. Generate Signed Release APK & Google Play Bundle (.aab)
1. In Android Studio, go to **Build > Generate Signed Bundle / APK**.
2. Select **Android App Bundle (.aab)** for Google Play Console submission or **APK** for direct download/testing.
3. Create a new Keystore (`rushingpoint-release-key.jks`) and set a strong password.
4. Choose `release` build variant and click **Finish**.
5. Your signed output files will be in:
   - APK: `android/app/release/app-release.apk`
   - AAB: `android/app/release/app-release.aab`

---

## 🍏 Step 3: Building Apple iOS (.ipa) & Publishing to App Store

### 1. Add iOS Platform (Requires macOS & Xcode)
```bash
npx cap add ios
npx cap copy ios
npx cap open ios
```

### 2. Configure iOS Permissions (`ios/App/App/Info.plist`)
Add user permission descriptions inside `<dict>`:
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>RushingPoint requires your location to deliver orders and calculate distance accurately.</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Riders require background location to transmit live delivery radar telemetry.</string>

<key>NSCameraUsageDescription</key>
<string>Required to upload merchant product images and capture proof-of-delivery photos.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Required to select store photos and waybill receipts.</string>
```

### 3. Build & Archive for App Store Connect
1. In Xcode, select your team under **Signing & Capabilities** (requires Apple Developer Program membership).
2. Set build target to **Any iOS Device (arm64)**.
3. Select **Product > Archive**.
4. Once the archive finishes, click **Distribute App > App Store Connect > Upload**.
5. The build will appear in **TestFlight** within 15 minutes for internal testing, and can then be submitted for official App Store Review.

---

## 🌐 Step 4: Hosting the Admin Portal & API Online

The centralized backend and Admin Portal are designed to be deployed on **Render**, **Railway**, or any **Ubuntu VPS (DigitalOcean / AWS / Linode)**:

### 1-Click Hosting on Render / Railway
1. Push your repository to GitHub: `git push origin main`
2. In **Render.com** or **Railway.app**, click **New > Web Service** and link your repo.
3. Configure environment variables:
   ```env
   PORT=8000
   JWT_SECRET=your_production_secure_jwt_secret_key_here
   MASTER_SECURITY_PIN=889900
   FLUTTERWAVE_SECRET_KEY=FLWSECK-xxxxxxxxxxxxxxxxxxxxxxxx
   FLUTTERWAVE_PUBLIC_KEY=FLWPUBK-xxxxxxxxxxxxxxxxxxxxxxxx
   ```
4. Build Command: `pip install -r requirements.txt`
5. Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

---

## 🔐 Complete Platform Roster & Credentials for Testing

Use the verified credentials below to sign in and test each platform module:

### 👑 Administrator & Staff Roles (Admin Portal)
| Role | Full Name | Login Email | Password |
|---|---|---|---|
| **Chief Super Admin** | Chief Super Admin | `admin@rushingpoint.com` | `admin123` |
| **Operations Manager** | Chidi Okafor | `ops@rushingpoint.com` | `ops123` |
| **Dispatcher** | Babatunde Lawal | `dispatch@rushingpoint.com` | `dispatch123` |
| **Finance Officer** | Ngozi Adeleke | `finance@rushingpoint.com` | `finance123` |
| **Customer Support** | Fatima Bello | `support@rushingpoint.com` | `support123` |

### 🏪 Active Merchant Stalls & Vendors
| Store Name | Vendor Name | Login Email | Password |
|---|---|---|---|
| **Tasty Kitchen Bites** (Food & Grills) | Emeka Chukwudi | `vendor@rushingpoint.com` | `vendor123` |
| **Mega Groceries Hub** (Supermarket) | Amina Danjuma | `groceries@rushingpoint.com` | `vendor123` |
| **Gadget Vault Lagos** (Phones & Tech) | Tunde Bakare | `gadgets@rushingpoint.com` | `vendor123` |
| **Prime Acres & Lekki Lands** (Real Estate) | Alhaji Garba Danladi | `estates@rushingpoint.com` | `vendor123` |
| **Alaba Blocks & Cement Depot** (Building) | Chief Sunday Okoro | `materials@rushingpoint.com` | `vendor123` |

### 🛵 Active Logistics Fleet & Riders
| Vehicle / Fleet Type | Rider Name | Login Email | Password |
|---|---|---|---|
| **Internal Motorcycle (Bike 1)** | Kayode Adeleke | `rider@rushingpoint.com` | `rider123` |
| **Internal Cargo Tricycle** | Ibrahim Musa | `rider2@rushingpoint.com` | `rider123` |
| **External Partner Van** | Samuel Okon | `rider3@rushingpoint.com` | `rider123` |
| **Partner Tricycle (Katsina)** | Usman Katsina | `rider4@rushingpoint.com` | `rider123` |

### 🛍️ Customers
| Customer Type | Full Name | Login Email / Phone | Password |
|---|---|---|---|
| **Customer 1** | Tariq Al-Mansoor | `customer@rushingpoint.com` | `customer123` |
| **Customer 2 (Verified Phone)** | Verified Customer | `+2348099887766` | `customerpass123` |
