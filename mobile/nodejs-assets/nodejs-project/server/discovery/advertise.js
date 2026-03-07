/**
 * mDNS advertising for the mobile StreamNode server.
 * Publishes this device on the LAN so other nodes (laptop, etc.) can discover it.
 */
const os = require('os');

let bonjourInstance = null;
let service = null;
let running = false;

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function startAdvertise(port) {
  if (running || service) {
    console.log('[mDNS] Already advertising');
    return;
  }

  // Set running immediately — don't wait for the async 'up' event,
  // otherwise stopAdvertise() called quickly may see running=false and bail.
  running = true;

  try {
    // bonjour-service is a CJS-compatible fork safe for nodejs-mobile
    const { Bonjour } = require('bonjour-service');
    bonjourInstance = new Bonjour();

    service = bonjourInstance.publish({
      name: 'StreamNode-Mobile',
      type: 'streamnode',
      port: port || 9000,
      txt: {
        ip: getLocalIP(),
        version: '1.0',
        platform: 'android',
      },
    });

    service.on('up', () => {
      console.log(`[mDNS] Service published: StreamNode-Mobile._streamnode._tcp.local`);
    });

    service.on('error', (err) => {
      console.error('[mDNS] Publish error:', err.message);
      running = false;
    });
  } catch (err) {
    console.error('[mDNS] Failed to start advertising:', err.message);
    running = false;
  }
}

function stopAdvertise() {
  // Guard on running OR service/bonjourInstance in case 'up' hasn't fired yet
  if (!running && !service && !bonjourInstance) return;
  running = false;
  try {
    // unpublishAll sends DNS-SD goodbye (zero-TTL) packets so LAN peers
    // immediately remove this entry rather than waiting for TTL expiry.
    if (bonjourInstance) {
      bonjourInstance.unpublishAll(() => {
        if (bonjourInstance) { bonjourInstance.destroy(); bonjourInstance = null; }
      });
    }
    if (service) { service.stop(); service = null; }
    console.log('[mDNS] Advertising stopped');
  } catch (err) {
    console.error('[mDNS] Error stopping advertising:', err.message);
    // Force-clear references even on error
    service = null;
    bonjourInstance = null;
  }
}

function advertiseStatus() {
  return { running, ip: getLocalIP() };
}

module.exports = { startAdvertise, stopAdvertise, advertiseStatus, getLocalIP };
