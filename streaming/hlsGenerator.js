/**
 * hlsGenerator.js — on-demand HLS session manager (ESM)
 *
 * Sessions are created per (file + quality) tuple.
 * FFmpeg runs in the background writing .ts segments + playlist to a temp dir.
 * Sessions are cleaned up after HLS_SESSION_TTL_MS idle time.
 */

import ffmpeg  from 'fluent-ffmpeg';
import fs      from 'fs';
import path    from 'path';
import crypto  from 'crypto';
import {
  HLS_TEMP_DIR,
  HLS_SEGMENT_LENGTH,
  HLS_SESSION_TTL_MS,
  HLS_QUALITIES,
} from '../config/streamingConfig.js';

// sessionId → { dir, filePath, quality, proc, expireTimer, ready }
const sessions = new Map();

/** Ensure temp dir exists */
fs.mkdirSync(HLS_TEMP_DIR, { recursive: true });

/**
 * Start (or return existing) HLS session.
 * @param {string} filePath    Absolute source file path
 * @param {string} [quality]   '1080p' | '720p' | '480p' | 'original'
 * @returns {{ sessionId: string, playlistUrl: string, qualities: string[] }}
 */
export function startHlsSession(filePath, quality = '720p') {
  const key       = `${filePath}|${quality}`;
  const sessionId = crypto.createHash('sha1').update(key).digest('hex');

  // Reuse existing session and reset its expiry
  if (sessions.has(sessionId)) {
    _touch(sessionId);
    return _sessionInfo(sessionId);
  }

  const dir = path.join(HLS_TEMP_DIR, sessionId);
  fs.mkdirSync(dir, { recursive: true });

  const qProfile = HLS_QUALITIES.find(q => q.label === quality);
  const playlist = path.join(dir, 'playlist.m3u8');
  const segPat   = path.join(dir, 'segment%05d.ts');

  let cmd = ffmpeg(filePath)
    .inputOptions(['-threads 0'])
    .outputOptions([
      '-hls_time',          String(HLS_SEGMENT_LENGTH),
      '-hls_list_size',     '0',
      '-hls_flags',         'independent_segments+append_list',
      '-hls_segment_type',  'mpegts',
      `-hls_segment_filename`, segPat,
      '-start_number',      '0',
    ]);

  if (qProfile) {
    cmd = cmd
      .videoCodec('libx264')
      .outputOptions([
        `-vf scale=${qProfile.scale}:force_original_aspect_ratio=decrease`,
        `-b:v ${qProfile.videoBr}`,
        `-crf 23`,
        `-preset veryfast`,
        `-profile:v baseline`,
        `-level 3.0`,
        `-pix_fmt yuv420p`,
      ])
      .audioCodec('aac')
      .audioBitrate(qProfile.audioBr);
  } else {
    // 'original' — just re-mux to TS without transcoding
    cmd = cmd
      .videoCodec('copy')
      .audioCodec('aac');
  }

  cmd = cmd.format('hls').output(playlist);

  cmd.on('start', c => console.log(`[hls:${sessionId.slice(0,8)}] start`));
  cmd.on('progress', () => {});
  cmd.on('error', (err) => {
    if (!err.message.includes('SIGKILL'))
      console.error(`[hls:${sessionId.slice(0,8)}] error:`, err.message);
  });

  cmd.run();

  sessions.set(sessionId, {
    dir,
    filePath,
    quality,
    cmd,
    expireTimer: null,
  });

  _touch(sessionId);
  return _sessionInfo(sessionId);
}

/**
 * Serve the m3u8 playlist for a session.
 * Waits up to 10 s for the playlist to appear on disk.
 */
export async function getPlaylist(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return null;
  _touch(sessionId);

  const playlist = path.join(s.dir, 'playlist.m3u8');
  await _waitForFile(playlist, 10_000);
  return fs.existsSync(playlist) ? playlist : null;
}

/**
 * Serve a .ts segment file path for a session.
 */
export function getSegmentPath(sessionId, filename) {
  const s = sessions.get(sessionId);
  if (!s) return null;
  _touch(sessionId);
  const p = path.join(s.dir, filename);
  return fs.existsSync(p) ? p : null;
}

/**
 * List available qualities: always return all 3 labels + 'original'.
 */
export const availableQualities = HLS_QUALITIES.map(q => q.label).concat(['original']);

/** Destroy a session early (e.g. revoke). */
export function destroySession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return;
  clearTimeout(s.expireTimer);
  try { s.cmd?.kill('SIGKILL'); } catch {}
  fs.rmSync(s.dir, { recursive: true, force: true });
  sessions.delete(sessionId);
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _touch(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return;
  clearTimeout(s.expireTimer);
  s.expireTimer = setTimeout(() => destroySession(sessionId), HLS_SESSION_TTL_MS);
}

function _sessionInfo(sessionId) {
  return {
    sessionId,
    playlistPath: `/hls/${sessionId}/playlist.m3u8`,
    qualities: availableQualities,
  };
}

function _waitForFile(filePath, timeoutMs) {
  return new Promise((resolve) => {
    if (fs.existsSync(filePath)) return resolve(true);
    const step = 200;
    let elapsed = 0;
    const id = setInterval(() => {
      if (fs.existsSync(filePath) || elapsed >= timeoutMs) {
        clearInterval(id);
        resolve(fs.existsSync(filePath));
      }
      elapsed += step;
    }, step);
  });
}

/** Cleanup all sessions on process exit */
process.on('exit', () => {
  for (const [id] of sessions) destroySession(id);
});
