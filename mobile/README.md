# StreamNode Mobile

A **React Native Android app** that runs an HTTP file streaming server, making the phone a **peer node** in the StreamNode LAN network.  
Other devices on the same Wi-Fi (laptop, TV, etc.) can browse and stream files directly from the phone.

---

## Architecture

```
┌──────────────────────────────────────────┐
│          React Native App (UI)           │
│  App.js — status display, permission     │
│            requests, bridge controls     │
└─────────────────┬────────────────────────┘
                  │ nodejs-mobile-react-native bridge (rn-bridge)
┌─────────────────▼────────────────────────┐
│       Node.js Process (main.js)          │
│  Express HTTP server on port 9000        │
│  ┌──────────────────────────────────┐    │
│  │  GET /device                     │    │
│  │  GET /files?path=<dir>           │    │
│  │  GET /file/info?id=<path>        │    │
│  │  GET /stream/:filename           │    │  ←── LAN clients
│  │  GET /search?q=<query>           │    │
│  │  GET /ping                       │    │
│  └──────────────────────────────────┘    │
│  mDNS (bonjour-service) — advertises     │
│    _streamnode._tcp.local on port 9000   │
└──────────────────────────────────────────┘
```

---

## File Layout

```
mobile/
├── App.js                    ← React Native UI
├── index.js                  ← RN entry point
├── package.json
├── babel.config.js
├── metro.config.js
├── android/
│   ├── build.gradle
│   ├── settings.gradle
│   ├── gradle.properties
│   └── app/
│       ├── build.gradle
│       ├── proguard-rules.pro
│       └── src/main/
│           ├── AndroidManifest.xml   ← all storage + network permissions
│           ├── java/com/streamnodemobile/
│           │   ├── MainActivity.java
│           │   └── MainApplication.java
│           └── res/values/
│               ├── strings.xml
│               └── styles.xml
└── nodejs-assets/
    └── nodejs-project/         ← Node.js server (bundled into APK)
        ├── main.js             ← server entry point
        ├── package.json        ← express, bonjour-service, mime-types
        └── server/
            ├── config/index.js           ← shared folder paths + port
            ├── routes/device.js          ← GET /device
            ├── routes/files.js           ← GET /files, GET /file/info
            ├── routes/stream.js          ← GET /stream/:filename (Range)
            ├── routes/search.js          ← GET /search?q=
            └── discovery/advertise.js    ← mDNS via bonjour-service
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/device` | Device metadata (name, OS, IP, capabilities) |
| GET | `/devices` | Alias for `/device` |
| GET | `/files?path=<dir>` | List files and folders in a directory |
| GET | `/file/info?id=<path>` | Metadata for a single file |
| GET | `/stream/:filename?path=<dir>` | Stream file with Range Request support (206) |
| GET | `/search?q=<query>` | Search all shared folders recursively |
| GET | `/ping` | Health check |

### Shared folders (default)

```
/storage/emulated/0/Movies
/storage/emulated/0/Music
/storage/emulated/0/DCIM
/storage/emulated/0/Pictures
/storage/emulated/0/Download
```

Edit `nodejs-assets/nodejs-project/server/config/index.js` to change them.

---

## Build & Run

### Prerequisites

```bash
# Java 17+
java -version

# Android SDK — set ANDROID_HOME
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools

# Node.js 18+
node -v
```

### Install React Native dependencies

```bash
cd mobile
npm install
```

### Connect an Android device (USB debugging enabled) then:

```bash
cd mobile
npx react-native run-android
```

Or build a release APK:

```bash
cd mobile/android
./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

---

## Usage

Once the app is installed and running on the phone:

1. The Node.js server starts automatically on port **9000**
2. The phone's LAN IP and port are shown in the UI
3. The service is advertised via mDNS as `_streamnode._tcp.local`
4. The laptop's StreamNode server discovers the phone automatically

From the laptop browser or VLC:

```
http://192.168.1.110:9000/files
http://192.168.1.110:9000/stream/video.mp4
http://192.168.1.110:9000/search?q=holiday
```

### Manual discovery (if mDNS is blocked by router)

From the laptop client:

```js
import { probeDevice } from './services/discovery';
const device = await probeDevice('192.168.1.110', 9000);
```

---

## Permissions

The app requests on Android 13+:
- `READ_MEDIA_VIDEO`
- `READ_MEDIA_IMAGES`
- `READ_MEDIA_AUDIO`

On Android 10–12:
- `READ_EXTERNAL_STORAGE`
- `MANAGE_EXTERNAL_STORAGE`

Plus: `INTERNET`, `ACCESS_WIFI_STATE`, `CHANGE_WIFI_MULTICAST_STATE` (needed for mDNS).

---

## Streaming Notes

- **Range requests** (HTTP 206) are fully supported — VLC, browsers, and video players can seek
- Files are read in **streaming chunks** — large files never load entirely into RAM
- Chunk size is determined by the `Range` header sent by the client
