/**
 * metadataService.js — extract media metadata via ffprobe (ESM)
 *
 * Returns a normalised info object. Falls back gracefully if ffprobe is
 * unavailable or the file is not a media file.
 */

import ffmpeg from 'fluent-ffmpeg';
import path   from 'path';
import {
  BROWSER_COMPATIBLE_VIDEO_CODECS,
  BROWSER_COMPATIBLE_AUDIO_CODECS,
  BROWSER_COMPATIBLE_CONTAINERS,
} from '../config/streamingConfig.js';

/**
 * Probe a file with ffprobe and resolve a metadata object.
 * @param {string} filePath  Absolute path to the media file.
 * @returns {Promise<Object>}
 */
export function probeFile(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);

      const fmt      = data.format || {};
      const streams  = data.streams || [];
      const vStream  = streams.find(s => s.codec_type === 'video');
      const aStream  = streams.find(s => s.codec_type === 'audio');
      const sStream  = streams.find(s => s.codec_type === 'subtitle');

      const duration   = parseFloat(fmt.duration) || 0;
      const bitrate    = fmt.bit_rate ? Math.round(parseInt(fmt.bit_rate) / 1000) : null;
      const sizeBytes  = fmt.size ? parseInt(fmt.size) : null;

      const videoCodec = vStream?.codec_name?.toLowerCase() || null;
      const audioCodec = aStream?.codec_name?.toLowerCase() || null;
      const width      = vStream?.width  || null;
      const height     = vStream?.height || null;
      const fps        = vStream ? evalFps(vStream.r_frame_rate) : null;
      const pixFmt     = vStream?.pix_fmt || null;

      const ext        = path.extname(filePath).toLowerCase();
      const container  = ext;

      // Codec compatibility check
      const videoCompat = !videoCodec || BROWSER_COMPATIBLE_VIDEO_CODECS.has(videoCodec);
      const audioCompat = !audioCodec || BROWSER_COMPATIBLE_AUDIO_CODECS.has(audioCodec);
      const containerCompat = BROWSER_COMPATIBLE_CONTAINERS.has(container);
      const browserCompatible = videoCompat && audioCompat && containerCompat;

      resolve({
        duration,                     // seconds
        durationFormatted: formatDur(duration),
        bitrate,                      // kbps
        bitrateFormatted: bitrate ? `${bitrate} kbps` : null,
        sizeBytes,
        sizeMB: sizeBytes ? (sizeBytes / 1024 / 1024).toFixed(1) : null,

        // Video
        videoCodec,
        resolution:  width && height ? `${width}x${height}` : null,
        width,
        height,
        fps,
        pixFmt,

        // Audio
        audioCodec,
        audioChannels: aStream?.channels || null,
        audioSampleRate: aStream?.sample_rate || null,

        // Subtitles embedded in container
        hasEmbeddedSubtitles: !!sStream,
        embeddedSubtitleLang: sStream?.tags?.language || null,

        // Container
        container,
        formatName: fmt.format_name || null,

        // Compatibility
        browserCompatible,
        videoCompatible: videoCompat,
        audioCompatible: audioCompat,
        containerCompatible: containerCompat,
        transcodeReason: !browserCompatible
          ? !containerCompat ? `container ${ext} not supported`
          : !videoCompat     ? `video codec ${videoCodec} not supported`
          : `audio codec ${audioCodec} not supported`
          : null,
      });
    });
  });
}

function evalFps(str) {
  if (!str || str === '0/0') return null;
  const [n, d] = str.split('/').map(Number);
  if (!d) return n || null;
  return Math.round((n / d) * 100) / 100;
}

function formatDur(sec) {
  if (!sec) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}
