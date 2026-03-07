/**
 * transcoder.js — on-the-fly FFmpeg transcoding (ESM)
 *
 * Pipes FFmpeg output directly to the HTTP response — nothing is written to disk.
 */

import ffmpeg from 'fluent-ffmpeg';
import {
  TRANSCODE_CRF,
  TRANSCODE_PRESET,
  TRANSCODE_AUDIO_BR,
} from '../config/streamingConfig.js';

/**
 * Stream a transcoded version of filePath to the Express response.
 *
 * Target is always H264 video + AAC audio inside an MP4 container,
 * piped to stdout and forwarded to the client.
 *
 * @param {string}   filePath      Absolute path to source file
 * @param {import('express').Response} res
 * @param {Object}   [opts]
 * @param {string}   [opts.quality]    '1080p' | '720p' | '480p' | 'original'
 * @param {number}   [opts.startSec]   seek position in seconds
 * @param {boolean}  [opts.audioOnly]  transcode to AAC mp3 only
 */
export function transcodeToResponse(filePath, res, opts = {}) {
  const { quality = 'original', startSec = 0, audioOnly = false } = opts;

  const scaleMap = {
    '1080p': '1920:1080',
    '720p':  '1280:720',
    '480p':  '854:480',
  };
  const vbrMap = {
    '1080p': '4000k',
    '720p':  '2500k',
    '480p':  '1000k',
  };

  res.setHeader('Content-Type', audioOnly ? 'audio/mpeg' : 'video/mp4');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  // Signal that this stream supports seeking via re-requesting with seekSec param
  res.setHeader('X-Transcode-Seekable', 'true');

  let cmd = ffmpeg(filePath)
    .inputOptions(['-threads 0'])
    .seekInput(startSec);

  if (audioOnly) {
    cmd = cmd
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('192k')
      .format('mp3');
  } else {
    cmd = cmd.videoCodec('libx264')
      .outputOptions([
        `-crf ${TRANSCODE_CRF}`,
        `-preset ${TRANSCODE_PRESET}`,
        '-profile:v baseline',
        '-level 3.0',
        '-movflags frag_keyframe+empty_moov+faststart',
        '-pix_fmt yuv420p',
      ])
      .audioCodec('aac')
      .audioBitrate(TRANSCODE_AUDIO_BR)
      .format('mp4');

    if (scaleMap[quality]) {
      cmd = cmd.outputOptions([
        `-vf scale=${scaleMap[quality]}:force_original_aspect_ratio=decrease`,
        `-b:v ${vbrMap[quality]}`,
      ]);
    }
  }

  cmd
    .on('start', (cmdLine) => {
      console.log('[transcode] start:', cmdLine.slice(0, 120) + '…');
    })
    .on('error', (err) => {
      console.error('[transcode] error:', err.message);
      if (!res.headersSent) res.status(500).end();
      else res.end();
    })
    .pipe(res, { end: true });

  // Allow client disconnect to kill FFmpeg
  res.on('close', () => cmd.kill('SIGKILL'));
}
