import express from "express";
import cors    from "cors";
import os      from "os";
import filesRoute   from "./routes/files.js";
import streamRoute  from "./routes/stream.js";
import deviceRoute  from "./routes/devices.js";
import pairRoute    from "./routes/pair.js";
import mediaRoute   from "./routes/media.js";
import indexRoute   from "./routes/index.js";
import virtualRoute from "./routes/virtual.js";
import authenticate from "./middleware/auth.js";
import { startAdvertise } from "./discovery/advertise.js";

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

const app = express();

app.use(cors({
  origin: '*',
  allowedHeaders: ['Range', 'Content-Type', 'Authorization', 'X-Device-Tokens'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
}));
app.use(express.json());

// ── Public routes (no auth required) ──────────────────────────────────────────
app.use("/pair",    pairRoute);          // POST /pair/request, POST /pair/verify
app.use("/device",  deviceRoute);        // GET  /device
app.use("/devices", deviceRoute);        // GET  /devices (LAN discovery)
app.use("/index",   indexRoute);         // GET  /index  – flat file list for aggregation

// ── Protected routes (Bearer token required) ──────────────────────────────────
app.use("/files",  authenticate, filesRoute);
app.use("/file",   authenticate, filesRoute);   // alias: GET /file/info?id=
app.use("/stream", authenticate, streamRoute);
app.use("/media",     authenticate, mediaRoute);
app.use("/subtitles", authenticate, mediaRoute);
app.use("/hls",       authenticate, mediaRoute);
// Virtual filesystem aggregation
app.use("/", authenticate, virtualRoute);        // /virtual-files, /search, /storage

const PORT = 8000;

app.listen(PORT, () => {
  const ip = getLocalIP();
  console.log(`[server] StreamNode running on port ${PORT}`);
  console.log(`[server] LAN IP: ${ip}`);
  console.log(`[server] Pair a device: POST http://localhost:${PORT}/pair/request`);

  // Auto-advertise on LAN so mobile devices can discover this laptop immediately
  startAdvertise({
    name: 'StreamNode-Laptop',
    type: 'streamnode',
    port: PORT,
    txt: { ip, version: '1.0', platform: 'laptop' },
  });
  console.log(`[mDNS] Advertising StreamNode-Laptop on ${ip}:${PORT}`);
});