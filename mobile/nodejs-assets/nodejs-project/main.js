/**
 * StreamNode Mobile — Node.js Server Entry Point
 *
 * Runs inside nodejs-mobile-react-native as a background Node.js process.
 * Communicates with the React Native layer via rn-bridge.
 *
 * Endpoints exposed:
 *   GET /device              — device metadata
 *   GET /files?path=<dir>    — directory listing
 *   GET /file/info?id=<path> — single file metadata
 *   GET /stream/:filename    — HTTP range-request streaming
 *   GET /search?q=<query>    — cross-folder file search
 */

'use strict';

const express    = require('express');
const os         = require('os');
const rnBridge   = require('rn-bridge');

const { SERVER_PORT }  = require('./server/config');
const deviceRoute      = require('./server/routes/device');
const filesRoute       = require('./server/routes/files');
const streamRoute      = require('./server/routes/stream');
const searchRoute      = require('./server/routes/search');
const pairRoute        = require('./server/routes/pair');
const authenticate     = require('./server/middleware/auth');
const { startAdvertise, stopAdvertise, advertiseStatus, getLocalIP }
                       = require('./server/discovery/advertise');

// ── Express app ──────────────────────────────────────────────────────────────

const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

// ── Public routes ──────────────────────────────────────────────────────────
app.use('/pair',    pairRoute);    // POST /pair/request, POST /pair/verify
app.use('/device',  deviceRoute);
app.use('/devices', deviceRoute);

// ── Protected routes ───────────────────────────────────────────────────────
app.use('/files',   authenticate, filesRoute);
app.use('/file',    authenticate, filesRoute);   // alias — GET /file/info?id=
app.use('/stream',  authenticate, streamRoute);
app.use('/search',  authenticate, searchRoute);

// Health check (public)
app.get('/ping', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

// ── Start server ─────────────────────────────────────────────────────────────

const server = app.listen(SERVER_PORT, '0.0.0.0', () => {
  const ip = getLocalIP();

  const info = {
    type:    'SERVER_STARTED',
    ip,
    port:    SERVER_PORT,
    message: 'Mobile StreamNode Server Started',
  };

  console.log('=====================================');
  console.log('  Mobile StreamNode Server Started');
  console.log(`  IP:   ${ip}`);
  console.log(`  PORT: ${SERVER_PORT}`);
  console.log('=====================================');

  // Notify React Native UI
  rnBridge.channel.send(JSON.stringify(info));

  // Start mDNS advertising
  startAdvertise(SERVER_PORT);
});

server.on('error', (err) => {
  console.error('[server] Failed to start:', err.message);
  rnBridge.channel.send(JSON.stringify({ type: 'SERVER_ERROR', message: err.message }));
});

// ── Bridge messages from React Native ────────────────────────────────────────

rnBridge.channel.on('message', (msg) => {
  try {
    const cmd = JSON.parse(msg);

    switch (cmd.type) {
      case 'GET_STATUS': {
        const ip   = getLocalIP();
        const adv  = advertiseStatus();
        rnBridge.channel.send(JSON.stringify({
          type:        'STATUS',
          ip,
          port:        SERVER_PORT,
          advertising: adv.running,
        }));
        break;
      }

      case 'ADVERTISE_ON':
        startAdvertise(SERVER_PORT);
        rnBridge.channel.send(JSON.stringify({ type: 'ADVERTISE_ON_ACK' }));
        break;

      case 'ADVERTISE_OFF':
        stopAdvertise();
        rnBridge.channel.send(JSON.stringify({ type: 'ADVERTISE_OFF_ACK' }));
        break;

      case 'STOP_SERVER':
        stopAdvertise();
        server.close(() => {
          rnBridge.channel.send(JSON.stringify({ type: 'SERVER_STOPPED' }));
        });
        break;

      case 'SCAN_DEVICES': {
        // Browse the LAN for other StreamNode nodes (laptop, etc.)
        try {
          const { Bonjour } = require('bonjour-service');
          const scanner = new Bonjour();
          const found = [];

          const browser = scanner.find({ type: 'streamnode' });

          browser.on('up', (svc) => {
            const ip =
              (svc.addresses && svc.addresses[0]) ||
              (svc.referer && svc.referer.address) ||
              svc.host ||
              null;

            if (!ip) return;

            // Skip ourselves
            if (ip === getLocalIP()) return;

            found.push({
              name: svc.name,
              host: ip,
              port: svc.port,
              url:  `http://${ip}:${svc.port}`,
              txt:  svc.txt || {},
            });
          });

          // Scan for 4 seconds then return results
          setTimeout(() => {
            browser.stop();
            scanner.destroy();
            rnBridge.channel.send(JSON.stringify({
              type:    'SCAN_RESULT',
              devices: found,
            }));
          }, 4000);
        } catch (err) {
          rnBridge.channel.send(JSON.stringify({
            type:    'SCAN_RESULT',
            devices: [],
            error:   err.message,
          }));
        }
        break;
      }

      case 'GET_TRUSTED_DEVICES': {
        const fs    = require('fs');
        const dFile = require('path').join(__dirname, 'trusted_devices.json');
        try {
          const list = JSON.parse(fs.readFileSync(dFile, 'utf8'));
          rnBridge.channel.send(JSON.stringify({
            type:    'TRUSTED_DEVICES',
            devices: list.map(d => ({
              deviceName: d.deviceName,
              pairedAt:   new Date(d.pairedAt * 1000).toISOString().slice(0, 10),
            })),
          }));
        } catch {
          rnBridge.channel.send(JSON.stringify({ type: 'TRUSTED_DEVICES', devices: [] }));
        }
        break;
      }

      case 'REVOKE_DEVICE': {
        const fs    = require('fs');
        const dFile = require('path').join(__dirname, 'trusted_devices.json');
        try {
          const list     = JSON.parse(fs.readFileSync(dFile, 'utf8'));
          const filtered = list.filter(d => d.deviceName !== cmd.name);
          fs.writeFileSync(dFile, JSON.stringify(filtered, null, 2), 'utf8');
          rnBridge.channel.send(JSON.stringify({ type: 'DEVICE_REVOKED', name: cmd.name }));
        } catch (err) {
          rnBridge.channel.send(JSON.stringify({ type: 'REVOKE_ERROR', error: err.message }));
        }
        break;
      }

      default:
        console.warn('[bridge] Unknown command:', cmd.type);
    }
  } catch (e) {
    console.error('[bridge] Parse error:', e.message);
  }
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  stopAdvertise();
  server.close(() => process.exit(0));
});
