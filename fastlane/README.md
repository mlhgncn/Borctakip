Fastlane lanes for iOS TestFlight automation

Usage (GitHub Actions): workflow will call `bundle exec fastlane ios release version:1.2`

Secrets required (GitHub):
- APP_IDENTIFIER (e.g. com.example.borc)
- APPLE_TEAM_ID
- ASC_ISSUER_ID
- ASC_KEY_ID
- ASC_PRIVATE_KEY (base64 content of your AuthKey_XXXXXX.p8)
- MATCH_GIT_URL (optional) and MATCH_PASSWORD (if using match)

Local testing:
1. Install fastlane: `gem install fastlane`
2. Place your .p8 file and set `APP_STORE_CONNECT_API_KEY_PATH` env var, or use Fastlane match.
3. Run: `fastlane ios release version:1.2`
