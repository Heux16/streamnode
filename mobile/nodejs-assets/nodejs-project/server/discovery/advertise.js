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
  if (running) {
    console.log('[mDNS] Already advertising');
    return;
  }

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
      running = true;
      console.log(`[mDNS] Service published: StreamNode-Mobile._streamnode._tcp.local`);
    });

    service.on('error', (err) => {
      console.error('[mDNS] Publish error:', err.message);
    });
  } catch (err) {
    console.error('[mDNS] Failed to start advertising:', err.message);
  }
}

function stopAdvertise() {
  if (!running) return;
  try {
    if (service) service.stop();
    if (bonjourInstance) bonjourInstance.destroy();
    running = false;
    service = null;
    bonjourInstance = null;
    console.log('[mDNS] Advertising stopped');
  } catch (err) {
    console.error('[mDNS] Error stopping advertising:', err.message);
  }
}

function advertiseStatus() {
  return { running, ip: getLocalIP() };
}

module.exports = { startAdvertise, stopAdvertise, advertiseStatus, getLocalIP };
