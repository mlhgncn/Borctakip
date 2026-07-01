AdMob Integration — Setup & Run

1) Add env values
- Copy `.env.example` to `.env` and replace with your AdMob App/AdUnit IDs (use Test IDs during development).
	- Set `REACT_APP_ADMOB_APP_ID` to your AdMob App ID (example: `ca-app-pub-3621419452103208~7477725836`).
	- Note: iOS Info.plist has been updated with this App ID automatically.

2) Install dependency (already done in repo)
```bash
npm install
npm install @capacitor-community/admob --save
```

3) Build & sync for iOS
```bash
npm run build
npx cap sync ios
cd ios/App
pod install
npx cap open ios
```

4) Run on a real device
- Use Xcode to run on a physical device (TestFlight or direct). Use AdMob test ad unit IDs while developing.

5) Privacy & Consent
- Provide a settings toggle to let users disable ads (already added in `Ayarlar` → "Reklamları Göster"). Persisted in localStorage key `bp_ads_enabled`.
- Add/update your privacy policy mentioning AdMob and data collection.

6) Testing
- Use the test AdUnit IDs from `.env.example` above to verify banners, interstitials and rewarded ads.

8) Android
- If you add an Android native project, add the following to `AndroidManifest.xml` inside `<application>`:

```xml
<meta-data
	android:name="com.google.android.gms.ads.APPLICATION_ID"
	android:value="ca-app-pub-3621419452103208~7477725836"/>
```

Replace the value with your App ID.

7) Notes & Troubleshooting
- Web build may show source-map warnings for the plugin; these are harmless for the web bundle but ensure native iOS build completes with `pod install`.
- If ads don't appear on device, check that the plugin is included in `ios/App/Podfile` after `npx cap sync ios` and that `App` has the correct App ID in AdMob.
