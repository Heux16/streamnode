# StreamNode

A self-hosted LAN media streaming system. Stream movies, music and photos from your laptop or Android phone to any device on the same Wi-Fi network. No internet required.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Local Network                     │
│                                                      │
│  ┌──────────────────┐        ┌─────────────────────┐ │
│  │  Laptop Server   │◄──────►│  Mobile Server      │ │
│  │  Node.js :8000   │  mDNS  │  nodejs-mobile :9000│ │
│  └────────┬─────────┘        └─────────────────────┘ │
│           │                                          │
│  ┌────────▼─────────┐                                │
│  │  React Frontend  │  (web browser / mobile app)    │
│  │  Vite :5173      │                                │
│  └──────────────────┘                                │
└─────────────────────────────────────────────────────┘
```

| Component | Runtime | Port | Managed by |
|---|---|---|---|
| Laptop API server | Node.js ESM | `8000` | `systemctl --user streamnode` |
| React web frontend | Vite preview | `5173` | `systemctl --user streamnode-frontend` |
| Mobile API server | nodejs-mobile (Android) | `9000` | React Native app |

---

## Laptop Server (`server.js`)

**Tech:** Express 5, ESM (`"type":"module"`), JWT auth, nBonjour mDNS, FFmpeg/HLS

### Shared folders scanned

Configured in `config.js`:
```
./shared/movies
./shared/music
./shared/documents
```

### API Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/pair/request` | — | Request a pairing code |
| `POST` | `/pair/verify` | — | Verify code → receive JWT |
| `GET` | `/device` | — | This device's name, IP and port |
| `GET` | `/devices` | — | LAN-discovered devices (mDNS scan) |
| `GET` | `/index` | — | Flat file list of `./shared` (used by aggregator) |
| `GET` | `/files` | ✓ | Browse folder contents |
| `GET` | `/file/info?id=` | ✓ | Metadata for a single file |
| `GET` | `/stream/:name` | ✓ | HTTP range-capable file stream |
| `GET` | `/media/info` | ✓ | FFmpeg metadata extraction |
| `GET` | `/subtitles` | ✓ | Subtitle track extraction |
| `GET` | `/hls/*` | ✓ | HLS transcoded stream segments |
| `GET` | `/virtual-files` | ✓ | Aggregated categorised index (all devices) |
| `POST`| `/virtual-files/refresh` | ✓ | Bust 60-second aggregate cache |
| `GET` | `/search?q=` | ✓ | Multi-word AND filename search across all devices |
| `GET` | `/storage` | ✓ | Disk usage report (all devices) |

**Auth header:** `Authorization: Bearer <token>`  
**Device token forwarding:** `X-Device-Tokens: {"http://ip:port": "token", ...}`

### Virtual Filesystem

The laptop aggregates files from all discovered LAN devices into a single unified index:

- **`distributed/indexAggregator.js`** — scans `./shared` locally (depth 8) + fetches `/index` from each remote device. Cached 60 s.
- **`distributed/categoryService.js`** — categorises files into Videos / Music / Photos / Documents / Other by extension.
- **`distributed/storageManager.js`** — collects disk usage from laptop + all remote devices.
- **`distributed/routingService.js`** — resolves a file ID to its origin device for streaming.

### Running

```bash
# Development (auto-restart on save)
npm run dev

# Production (managed by systemd)
systemctl --user start streamnode
systemctl --user status streamnode
journalctl --user -u streamnode -f
```

### Deploying the frontend

```bash
npm run deploy-frontend
# Builds client/dist → restarts streamnode-frontend service
```

---

## Mobile Server (`mobile/nodejs-assets/nodejs-project/`)

**Tech:** Express (CJS), nodejs-mobile-react-native, JWT auth, mDNS advertising

Runs inside the Android APK as a background Node.js process, communicating with the React Native UI via a message bridge.

### Shared folders scanned (Android)

Configured in `server/config/index.js`:
```
/storage/emulated/0/Movies
/storage/emulated/0/Music
/storage/emulated/0/DCIM
/storage/emulated/0/Pictures
/storage/emulated/0/Download
```

### API Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/pair/request` | — | Request a pairing code |
| `POST` | `/pair/verify` | — | Verify code → receive JWT |
| `GET` | `/device` | — | Device name, IP and port |
| `GET` | `/devices` | — | LAN-discovered devices |
| `GET` | `/index` | ✓ | Flat file list (depth 5) for laptop aggregator |
| `GET` | `/storage` | ✓ | Android disk usage (`df /storage/emulated/0`) |
| `GET` | `/files` | ✓ | Browse folder contents |
| `GET` | `/file/info?id=` | ✓ | Single file metadata |
| `GET` | `/stream/:name` | ✓ | HTTP range-capable file stream |
| `GET` | `/search?q=` | ✓ | Filename search |
| `GET` | `/ping` | — | Health check `{status:"ok"}` |

**Auth:** Same JWT Bearer scheme as the laptop server.

### Building the APK

```bash
cd mobile/android
./gradlew assembleRelease
# Output: app/build/outputs/apk/release/app-release.apk

# Install to connected device
adb install -r app/build/outputs/apk/release/app-release.apk
```

### Mobile app tabs

| Tab | Description |
|---|---|
| **My Server** | Node.js server status, IP, mDNS toggle, trusted devices, incoming pair codes |
| **Browse** | Discover LAN devices → browse folders → stream files |
| **Virtual FS** | Unified view of all devices: categorised files, global search, storage overview |

---

## React Web Client (`client/`)

**Tech:** React 18, Vite, Tailwind CSS, React Router

### Pages

| Route | Description |
|---|---|
| `/` | Dashboard — discovered devices, quick access |
| `/device` | File explorer for the selected device |
| `/player` | Video / audio / image player |
| `/virtual` | Virtual Filesystem — all devices unified |

### Key services (`client/src/services/api.js`)

- `makeClient(baseUrl)` — creates an Axios instance pointed at a device
- `setBaseURL(url)` / `resetToLaptop()` — switch target device
- `getLaptopBaseURL()` — finds the laptop's stored token URL from `localStorage`
- `loadToken(url)` / `saveToken(url, token)` — token persistence in `localStorage`
- `collectDeviceTokens()` — gathers all `sn_token_*` entries for `X-Device-Tokens` header
- `getVirtualFiles()` / `searchGlobal(q)` / `getStorageReport()` / `refreshVirtualIndex()`

### Running

```bash
cd client
npm install
npm run dev       # Dev server on :5173
npm run build     # Build to dist/
npm run preview   # Serve dist/ on :5173
```

---

## Authentication & Pairing

All protected endpoints require a JWT Bearer token obtained by pairing.

**Pairing flow:**
1. Client calls `POST /pair/request` — server displays a 6-digit code on its own screen
2. User reads the code and calls `POST /pair/verify` with `{ pairingCode, deviceName }`
3. Server returns `{ token }` — client stores it as `localStorage["sn_token_<url>"]` (web) or in `AsyncStorage` (mobile)

Tokens expire after **7 days**. Each device stores its own token file:
- Laptop: `trusted_devices.json` (gitignored)
- Mobile: `trusted_devices.json` inside the app's private folder

---

## mDNS Discovery

Both servers advertise themselves as `_streamnode._tcp` services via Bonjour/mDNS. The laptop scans for peers using `discovery/scan.js`. Discovered devices appear in the Browse tab and are automatically included in the Virtual FS aggregator.

---

## Systemd Services (Laptop)

```bash
# ~/.config/systemd/user/streamnode.service
# Runs: node server.js  (port 8000)

# ~/.config/systemd/user/streamnode-frontend.service
# Runs: npm run preview -- --port 5173 --host 0.0.0.0

systemctl --user enable streamnode streamnode-frontend   # autostart on login
systemctl --user start  streamnode streamnode-frontend
systemctl --user status streamnode streamnode-frontend
```

---

## Project Structure

```
streamnode/
├── server.js                          # Laptop Express server (entry point)
├── config.js                          # Shared folder paths
├── routes/
│   ├── devices.js                     # /device, /devices
│   ├── files.js                       # /files, /file
│   ├── stream.js                      # /stream
│   ├── index.js                       # /index (public flat file list)
│   └── virtual.js                     # /virtual-files, /search, /storage
├── distributed/
│   ├── indexAggregator.js             # Cross-device file index + cache
│   ├── categoryService.js             # Extension → category mapping
│   ├── storageManager.js              # Cross-device disk usage
│   └── routingService.js             # File ID → stream URL resolution
├── discovery/
│   ├── advertise.js                   # mDNS advertise
│   └── scan.js                        # mDNS scan
├── shared/                            # Media files served by laptop (gitignored)
│   ├── movies/
│   ├── music/
│   ├── documents/
│   └── photos/
├── client/                            # React web frontend
│   └── src/
│       ├── pages/
│       │   ├── Dashboard.jsx
│       │   ├── FileExplorer.jsx
│       │   ├── PlayerPage.jsx
│       │   └── VirtualFSPage.jsx
│       ├── components/
│       │   ├── PairingModal.jsx
│       │   └── ...
│       └── services/api.js
└── mobile/                            # Android app
    ├── App.js                         # React Native UI (3 tabs)
    └── nodejs-assets/nodejs-project/
        ├── main.js                    # Mobile Express server
        └── server/
            ├── routes/                # index, storage, files, stream, pair …
            ├── middleware/auth.js
            └── config/index.js
```

---

## Gitignored Files

```
trusted_devices.json      # JWT-paired device tokens
.server_secret            # JWT signing secret
shared/                   # Media files
node_modules/
dist/
```
