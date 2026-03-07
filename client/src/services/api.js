import axios from "axios";

// auto resolves to whatever IP the browser used to reach the frontend
const DEFAULT_BASE_URL = `http://${window.location.hostname}:8000`;

// ── Token storage (localStorage, keyed by device base URL) ───────────────────
const TOKEN_KEY = (url) => `sn_token_${url}`;
export function saveToken(url, token) { localStorage.setItem(TOKEN_KEY(url), token); }
export function loadToken(url) { return localStorage.getItem(TOKEN_KEY(url)) || null; }
export function clearToken(url) { localStorage.removeItem(TOKEN_KEY(url)); }

// ── Axios client factory ──────────────────────────────────────────────────────
function makeClient(baseURL) {
  const c = axios.create({ baseURL, timeout: 8000 });
  // Inject stored JWT on every request
  c.interceptors.request.use((cfg) => {
    const token = loadToken(baseURL);
    if (token) cfg.headers["Authorization"] = `Bearer ${token}`;
    return cfg;
  });
  return c;
}

let client = makeClient(DEFAULT_BASE_URL);

export function setBaseURL(url) {
  client = makeClient(url);
}

export function getBaseURL() {
  return client.defaults.baseURL;
}

// GET /device
export async function getDeviceInfo() {
  const { data } = await client.get("/device");
  return data;
}

// GET /files?path=
// folderPath=null → omit param, server uses its own default shared folder
export async function getFiles(folderPath) {
  const params = folderPath != null ? { path: folderPath } : {};
  const { data } = await client.get("/files", { params });
  return data;
}

// GET /file/info?id=
export async function getFileInfo(id) {
  const { data } = await client.get("/file/info", { params: { id } });
  return data;
}

// Returns the streaming URL directly (used in <video>, <audio>, <img>)
// Appends ?token= so the media element can fetch the protected stream
export function streamFile({ filename, folderPath }) {
  const base = getBaseURL();
  const p = new URLSearchParams();
  if (folderPath) p.set("path", folderPath);
  const token = loadToken(base);
  if (token) p.set("token", token);
  const qs = p.toString() ? `?${p}` : "";
  return `${base}/stream/${encodeURIComponent(filename)}${qs}`;
}

// ── Media Metadata & Compatibility ───────────────────────────────────────────

// GET /media/info?file=<path> → full ffprobe metadata
export async function getMediaInfo(filePath) {
  const { data } = await client.get("/media/info", { params: { file: filePath } });
  return data;
}

// GET /media/compat?file=<path> → { compatible, transcodeReason, videoCodec, audioCodec, container }
export async function getMediaCompat(filePath) {
  const { data } = await client.get("/media/compat", { params: { file: filePath } });
  return data;
}

// ── Transcode & Subtitles ─────────────────────────────────────────────────────

// Returns URL for on-the-fly FFmpeg transcode stream (H264+AAC in fragmented MP4)
export function transcodeUrl({ filePath, quality = "original", seek = 0 }) {
  const base  = getBaseURL();
  const token = loadToken(base);
  const p = new URLSearchParams({ file: filePath, quality });
  if (seek) p.set("seek", String(seek));
  if (token) p.set("token", token);
  return `${base}/media/transcode?${p}`;
}

// Returns subtitle URL — server auto-converts .srt → .vtt on the fly
export function subtitleUrl(filePath) {
  const base  = getBaseURL();
  const token = loadToken(base);
  const p = new URLSearchParams({ file: filePath });
  if (token) p.set("token", token);
  return `${base}/subtitles?${p}`;
}

// ── HLS Adaptive Streaming ────────────────────────────────────────────────────

// GET /hls/start?file=<path>&quality=<q> → { sessionId, playlistUrl, qualities }
export async function startHlsSession(filePath, quality = "720p") {
  const { data } = await client.get("/hls/start", { params: { file: filePath, quality } });
  return data;
}

// Returns a full HLS playlist URL usable by hls.js
export function hlsPlaylistUrl(sessionId) {
  const base  = getBaseURL();
  const token = loadToken(base);
  return `${base}/hls/${sessionId}/playlist.m3u8${token ? "?token=" + token : ""}`;
}

// POST /devices/advertise/on
export async function advertiseOn(body = {}) {
  const { data } = await client.post("/devices/advertise/on", body);
  return data;
}

// POST /devices/advertise/off
export async function advertiseOff() {
  const { data } = await client.post("/devices/advertise/off");
  return data;
}

// ── Pairing ───────────────────────────────────────────────────────────────────

// POST /pair/request → { pairingCode }
export async function requestPairingCode() {
  const { data } = await client.post("/pair/request");
  return data;
}

// POST /pair/verify → { token }
export async function verifyPairingCode(pairingCode, deviceName) {
  const { data } = await client.post("/pair/verify", { pairingCode, deviceName });
  return data;
}
