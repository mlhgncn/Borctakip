Build Ready Checklist — Borç Takip (AdMob)

Status: READY — waiting for user confirmation to run build.

Files touched:
- src/admob.ts (AdMob wrapper + helpers)
- src/App.tsx (init, banner show, interstitial trigger, ads toggle)
- .env.example (App ID + test ad unit IDs)
- AD_MOB_SETUP.md (setup & native notes)
- ios/App/App/Info.plist (GADApplicationIdentifier set)

Pre-build checklist (run only after you confirm):
1) Copy `.env.example` -> `.env` and set production AdUnit IDs if ready. Keep test IDs while testing.
   - `REACT_APP_ADMOB_APP_ID` should be your App ID (already added in Info.plist for iOS).
2) Install deps (if not installed):
```bash
npm install
npm install @capacitor-community/admob --save
```
3) Build web assets and sync native projects (do this when you tell me to build):
```bash
npm run build
npx cap sync ios
cd ios/App
pod install
npx cap open ios
```
4) In Xcode: verify signing, run on a physical device, confirm ads appear (use test AdUnit IDs).
5) Android: if you add Android, add the meta-data tag in `AndroidManifest.xml` inside `<application>`:
```xml
<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="ca-app-pub-3621419452103208~7477725836"/>
```

If you want, reply with "Build now" and I'll run the build + `npx cap sync ios` + `pod install` steps for you and report results. Otherwise tell me which additional checks you'd like before I proceed.
