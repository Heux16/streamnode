import axios from "axios";

// auto resolves to whatever IP the browser used to reach the frontend
const DEFAULT_BASE_URL = `http://${window.location.hostname}:8000`;

let client = axios.create({ baseURL: DEFAULT_BASE_URL, timeout: 8000 });

export function setBaseURL(url) {
  client = axios.create({ baseURL: url, timeout: 8000 });
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
export async function getFiles(folderPath = "./shared") {
  const { data } = await client.get("/files", {
    params: { path: folderPath },
  });
  return data;
}

// GET /file/info?id=
export async function getFileInfo(id) {
  const { data } = await client.get("/file/info", { params: { id } });
  return data;
}

// Returns the streaming URL directly (used in <video>, <audio>, <img>)
export function streamFile({ filename, folderPath }) {
  const base = getBaseURL();
  const params = folderPath ? `?path=${encodeURIComponent(folderPath)}` : "";
  return `${base}/stream/${encodeURIComponent(filename)}${params}`;
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
