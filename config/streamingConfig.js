/**
 * Streaming configuration — laptop server (ESM)
 */

import os   from 'os';
import path from 'path';

// ── Chunk / buffer sizes ──────────────────────────────────────────────────────
export const STREAM_CHUNK_SIZE   = 1024 * 1024;        // 1 MB  — highWaterMark for raw streams
export const HLS_SEGMENT_LENGTH  = 4;                  // seconds per HLS segment
export const HLS_SEGMENT_COUNT   = 10;                 // initial segments to pre-generate
export const HLS_SESSION_TTL_MS  = 30 * 60 * 1000;    // 30 min idle before cleanup
export const TRANSCODE_CRF       = 23;                 // H264 quality (lower = better, higher = smaller)
export const TRANSCODE_PRESET    = 'veryfast';         // FFmpeg speed preset (ultrafast…veryslow)
export const TRANSCODE_AUDIO_BR  = '128k';             // AAC bitrate

// ── HLS quality profiles ──────────────────────────────────────────────────────
export const HLS_QUALITIES = [
  { label: '1080p', scale: '1920:1080', videoBr: '4000k', audioBr: '192k' },
  { label: '720p',  scale: '1280:720',  videoBr: '2500k', audioBr: '128k' },
  { label: '480p',  scale: '854:480',   videoBr: '1000k', audioBr: '96k'  },
];

// ── Temp directory for HLS segments ──────────────────────────────────────────
export const HLS_TEMP_DIR = path.join(os.tmpdir(), 'streamnode-hls');

// ── Codec compatibility: browsers natively support these ─────────────────────
// Anything outside this list will trigger transcoding offers.
export const BROWSER_COMPATIBLE_VIDEO_CODECS = new Set([
  'h264', 'avc1', 'avc',
  'vp8', 'vp9',
  'av1',
  'theora',
]);
export const BROWSER_COMPATIBLE_AUDIO_CODECS = new Set([
  'aac', 'mp4a',
  'mp3', 'mpeg',
  'vorbis', 'opus',
  'flac',
]);
export const BROWSER_COMPATIBLE_CONTAINERS = new Set([
  '.mp4', '.m4v', '.webm', '.ogg', '.mp3', '.wav', '.flac',
  '.aac', '.opus', '.m4a',
]);
