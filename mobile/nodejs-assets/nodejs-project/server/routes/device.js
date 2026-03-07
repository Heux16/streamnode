/**
 * GET /device
 * Returns metadata about this mobile device.
 */
const express = require('express');
const os = require('os');

const router = express.Router();

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

router.get('/', (req, res) => {
  res.json({
    name: 'StreamNode-Mobile',
    os: 'Android',
    version: '1.0',
    ip: getLocalIP(),
    port: 9000,
    capabilities: [
      'file_browsing',
      'video_streaming',
      'audio_streaming',
    ],
  });
});

module.exports = router;
