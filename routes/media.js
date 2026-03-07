/**
 * routes/media.js — advanced media endpoints (ESM)
 *
 * GET  /media/info?file=<path>                     — metadata via ffprobe
 * GET  /media/compat?file=<path>                   — codec compatibility check
 * GET  /media/transcode?file=<path>&quality=<q>&seek=<s> — on-the-fly transcode
 * GET  /subtitles?file=<path>                      — serve .srt/.vtt subtitle file
 * GET  /hls/start?file=<path>&quality=<q>          — start / resume HLS session
 * GET  /hls/:sessionId/playlist.m3u8               — serve HLS playlist
 * GET  /hls/:sessionId/:segment                    — serve HLS .ts segment
 */

import express from 'express';
import fs      from 'fs';
import path    from 'path';
import { probeFile }                              from '../streaming/metadataService.js';
import { transcodeToResponse }                    from '../streaming/transcoder.js';
import { startHlsSession, getPlaylist, getSegmentPath, availableQualities }
                                                  from '../streaming/hlsGenerator.js';
import { STREAM_CHUNK_SIZE }                      from '../config/streamingConfig.js';

const router = express.Router();

// ── GET /media/info ───────────────────────────────────────────────────────────
router.get('/info', async (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'file param required' });
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'File not found' });

  try {
    const info = await probeFile(resolved);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: 'ffprobe failed', detail: err.message });
  }
});

// ── GET /media/compat ─────────────────────────────────────────────────────────
router.get('/compat', async (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'file param required' });
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'File not found' });

  try {
    const info = await probeFile(resolved);
    res.json({
      compatible:     info.browserCompatible,
      transcodeReason: info.transcodeReason,
      videoCodec:     info.videoCodec,
      audioCodec:     info.audioCodec,
      container:      info.container,
    });
  } catch (err) {
    // If probe fails we can't confirm compatibility — suggest transcode
    res.json({ compatible: false, transcodeReason: 'probe failed: ' + err.message });
  }
});

// ── GET /media/transcode ──────────────────────────────────────────────────────
router.get('/transcode', (req, res) => {
  const { file, quality = 'original', seek, audio } = req.query;
  if (!file) return res.status(400).json({ error: 'file param required' });
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'File not found' });

  transcodeToResponse(resolved, res, {
    quality,
    startSec:  seek ? parseFloat(seek) : 0,
    audioOnly: audio === '1',
  });
});

// ── GET /subtitles ────────────────────────────────────────────────────────────
router.get('/subtitles', (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'file param required' });
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'Subtitle file not found' });

  const ext = path.extname(resolved).toLowerCase();
  let ct;
  if (ext === '.vtt')      ct = 'text/vtt';
  else if (ext === '.srt') ct = 'text/plain';        // browsers auto-convert SRT via track element
  else return res.status(400).json({ error: 'Only .srt and .vtt supported' });

  res.setHeader('Content-Type', ct);
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Convert .srt to .vtt on the fly so browsers can use <track> directly
  if (ext === '.srt') {
    const content = fs.readFileSync(resolved, 'utf8');
    const vtt = 'WEBVTT\n\n' + content
      .replace(/\r\n/g, '\n')
      .replace(/(\d\d:\d\d:\d\d),(\d{3})/g, '$1.$2'); // SRT → VTT timestamp format
    res.setHeader('Content-Type', 'text/vtt');
    return res.send(vtt);
  }

  fs.createReadStream(resolved, { highWaterMark: STREAM_CHUNK_SIZE }).pipe(res);
});

// ── GET /hls/start ────────────────────────────────────────────────────────────
router.get('/hls/start', (req, res) => {
  const { file, quality = '720p' } = req.query;
  if (!file) return res.status(400).json({ error: 'file param required' });
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'File not found' });

  const info = startHlsSession(resolved, quality);
  res.json({
    sessionId:    info.sessionId,
    playlistUrl:  info.playlistPath,
    qualities:    availableQualities,
    selectedQuality: quality,
  });
});

// ── GET /hls/:sessionId/playlist.m3u8 ────────────────────────────────────────
router.get('/hls/:sessionId/playlist.m3u8', async (req, res) => {
  const filePath = await getPlaylist(req.params.sessionId);
  if (!filePath) return res.status(404).json({ error: 'Session not found or playlist not ready' });

  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');
  fs.createReadStream(filePath).pipe(res);
});

// ── GET /hls/:sessionId/:segment.ts ──────────────────────────────────────────
router.get('/hls/:sessionId/:segment', (req, res) => {
  const { sessionId, segment } = req.params;
  // Only allow .ts and .m3u8 filenames — block path traversal
  if (!/^[\w\-.]+\.(ts|m3u8)$/i.test(segment)) {
    return res.status(400).json({ error: 'Invalid segment name' });
  }

  const segPath = getSegmentPath(sessionId, segment);
  if (!segPath) return res.status(404).json({ error: 'Segment not found' });

  const stat = fs.statSync(segPath);
  res.setHeader('Content-Type', 'video/mp2t');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Access-Control-Allow-Origin', '*');
  fs.createReadStream(segPath, { highWaterMark: STREAM_CHUNK_SIZE }).pipe(res);
});

export default router;
