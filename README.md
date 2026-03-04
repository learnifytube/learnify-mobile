# LearnifyTube Mobile

Android companion app for LearnifyTube - sync and watch your downloaded YouTube videos offline.

## Features

- Sync videos from LearnifyTube desktop app over local WiFi
- Offline video playback
- Interactive transcript with tap-to-seek
- Auto-scrolling transcript during playback
- Dark theme optimized for viewing

## Getting Started

### Prerequisites

- Node.js 18+
- Android Emulator or Android device (USB/Wi-Fi debugging)

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm start

# Run on Android Emulator
npm run android
```

### Connecting to Desktop

1. Open LearnifyTube on your computer
2. Go to Settings > Sync
3. Enable "Allow mobile sync"
4. Note the IP address displayed
5. Open the mobile app and enter the IP address

## APK Self-Update (Standalone Distribution)

This app now supports in-app APK updates for non-Play Store installs.

### 1) Configure update source (GitHub Releases)

Set `expo.extra.apkUpdate.githubRepo` in `app.json`.

```json
{
  "expo": {
    "extra": {
      "apkUpdate": {
        "githubRepo": "hunght/learnify-mobile",
        "githubAssetName": "",
        "manifestUrl": "",
        "checkOnLaunch": true,
        "requestTimeoutMs": 10000
      }
    }
  }
}
```

Notes:
- `githubRepo` is `owner/repo` for GitHub Releases API (`/releases/latest`).
- `githubAssetName` is optional; if empty, updater picks the first `.apk` asset in latest release.
- `manifestUrl` is optional fallback if you still want your own `version.json`.

### 2) Version detection rules

Updater compares current app vs latest release using:
- `versionCode` (preferred): from release body line like `versionCode: 7`, or asset filename like `...-vc7.apk`.
- `versionName` semver fallback: from release tag/name like `v1.0.7`.

Optional `version.json` format (if using `manifestUrl`):

```json
{
  "versionCode": 7,
  "versionName": "1.0.7",
  "apkUrl": "https://your-domain.com/learnify/LearnifyTube-v1.0.7.apk",
  "releaseNotes": "Performance improvements and bug fixes.",
  "forceUpdate": false
}
```

### 3) Runtime behavior

- On Android launch, app checks latest GitHub Release (or `manifestUrl` if configured).
- If a newer build/version is detected, user is prompted.
- On accept, app downloads APK and opens Android package installer.

Important: every new APK must be signed with the same keystore as previous installs.

## CI/CD (100% Free)

Only one workflow is kept:
1. `Build Release APK` (`.github/workflows/android-apk.yml`)
2. Triggers: manual (`workflow_dispatch`) and tag push (`v*`)
3. On tag push (`refs/tags/v*`), CI builds APK and publishes a GitHub Release with the APK attached

### Manual Build + Download

```bash
# Trigger release APK build manually
gh workflow run "Build Release APK" --ref main

# Watch the latest run for this workflow
RUN_ID=$(gh run list --workflow "Build Release APK" --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$RUN_ID"

# Download artifact
gh run download "$RUN_ID" -n learnify-mobile-release-apk -D ./dist-apk

# Install on connected device
adb install -r ./dist-apk/*.apk
```

### Tagged Release (Auto Publish)

```bash
# From a clean main branch, bump version + versionCode + commit + tag + push
# CI auto-runs on the pushed tag and publishes:
# https://github.com/hunght/learnify-mobile/releases
npm run release:android
```

### Automation Scripts

```bash
# Trigger + wait + download release APK
bash ./scripts/gh-android-apk.sh

# Same flow on another ref and auto-install
bash ./scripts/gh-android-apk.sh --ref main --install

# Download latest successful release APK and install to running emulator
npm run test:emulator:apk

# If no emulator is running, script can auto-start one (first AVD by default)
bash ./scripts/test-emulator-apk.sh

# Use a specific run + emulator device id
bash ./scripts/test-emulator-apk.sh --run-id 22101650905 --device emulator-5554

# Choose which AVD to auto-start
bash ./scripts/test-emulator-apk.sh --avd Pixel_8_API_35

# Bump version + versionCode + commit + tag + push + wait for tag-triggered release workflow
npm run release:android
```

## Local Build

```bash
# Generate native projects
npx expo prebuild

# Build Android APK
cd android && ./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/
```

## Project Structure

```
├── app/                    # Expo Router pages
│   ├── _layout.tsx        # Root layout with navigation
│   ├── index.tsx          # Library screen (home)
│   ├── connect.tsx        # Desktop connection screen
│   └── player/[id].tsx    # Video player with transcript
├── components/            # Reusable UI components
├── services/              # API client and file downloader
├── stores/                # Zustand state stores
├── types/                 # TypeScript type definitions
└── assets/                # Images and icons
```

## Tech Stack

- **Framework**: React Native + Expo
- **Navigation**: Expo Router
- **State Management**: Zustand
- **Video Player**: expo-video
- **File System**: expo-file-system
- **CI/CD**: GitHub Actions + Fastlane

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT
