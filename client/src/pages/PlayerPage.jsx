import { useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useDevice } from "../context/DeviceContext.jsx";
import {
  streamFile,
  getMediaInfo,
  transcodeUrl,
  subtitleUrl,
  startHlsSession,
  hlsPlaylistUrl,
} from "../services/api.js";
import VideoPlayer from "../components/VideoPlayer.jsx";
import AudioPlayer from "../components/AudioPlayer.jsx";
import ImageViewer from "../components/ImageViewer.jsx";

// Streaming mode constants
const MODE_DIRECT    = "direct";
const MODE_TRANSCODE = "transcode";
const MODE_HLS       = "hls";

const QUALITIES = ["1080p", "720p", "480p", "original"];

function fmt(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function fmtDuration(s) {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

export default function PlayerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedDevice } = useDevice();

  const { file, folderPath } = location.state ?? {};

  // ── Streaming state ────────────────────────────────────────────────────────
  const [mode,    setMode]    = useState(MODE_DIRECT);
  const [quality, setQuality] = useState("720p");

  // ── Capability flag: true = server supports /media/* (laptop only) ─────────
  // null = probing, true = supported, false = not supported (mobile/other)
  const [supportsAdvanced, setSupportsAdvanced] = useState(null);

  // ── Metadata state ─────────────────────────────────────────────────────────
  const [mediaInfo, setMediaInfo] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError,   setInfoError]   = useState(null);

  // ── HLS session state ──────────────────────────────────────────────────────
  const [hlsSessionId, setHlsSessionId]   = useState(null);
  const [hlsLoading,   setHlsLoading]     = useState(false);

  // ── Direct src (used for direct / transcode modes) ─────────────────────────
  const directSrc = useMemo(() => {
    if (!file) return null;
    if (mode === MODE_TRANSCODE) {
      return transcodeUrl({ filePath: file.path ?? `${folderPath}/${file.name}`, quality });
    }
    return streamFile({ filename: file.name, folderPath });
  }, [file, folderPath, mode, quality]);

  // ── HLS src ────────────────────────────────────────────────────────────────
  const hlsSrc = useMemo(
    () => (hlsSessionId ? hlsPlaylistUrl(hlsSessionId) : null),
    [hlsSessionId]
  );

  const videoSrc = mode === MODE_HLS ? hlsSrc : directSrc;

  // ── Optional subtitle URL ──────────────────────────────────────────────────
  const subUrl = useMemo(() => {
    if (!file || !mediaInfo?.hasEmbeddedSubtitles) return undefined;
    const fp = file.path ?? `${folderPath}/${file.name}`;
    return subtitleUrl(fp);
  }, [file, folderPath, mediaInfo]);

  // ── Load metadata once file is available ──────────────────────────────────
  useEffect(() => {
    if (!file) return;
    const fp = file.path ?? `${folderPath}/${file.name}`;
    setInfoLoading(true);
    setInfoError(null);
    setMediaInfo(null);
    setSupportsAdvanced(null);
    setMode(MODE_DIRECT); // always reset to safe default when file changes
    getMediaInfo(fp)
      .then((info) => {
        setMediaInfo(info);
        setSupportsAdvanced(true);
        // Auto-suggest transcode only when server supports it and codec is incompatible
        if (!info.browserCompatible) setMode(MODE_TRANSCODE);
      })
      .catch((e) => {
        // 404 = mobile/remote server without /media routes — degrade gracefully
        const is404 = e?.response?.status === 404;
        setSupportsAdvanced(false);
        setInfoError(is404 ? null : e.message); // suppress 404 noise
        setMode(MODE_DIRECT);
      })
      .finally(() => setInfoLoading(false));
  }, [file, folderPath]);

  // ── Start/restart HLS session when mode=HLS or quality changes ────────────
  const launchHls = useCallback(async () => {
    if (!file) return;
    setHlsLoading(true);
    setHlsSessionId(null);
    try {
      const fp = file.path ?? `${folderPath}/${file.name}`;
      const { sessionId } = await startHlsSession(fp, quality);
      setHlsSessionId(sessionId);
    } catch (e) {
      console.error("HLS start failed:", e);
    } finally {
      setHlsLoading(false);
    }
  }, [file, folderPath, quality]);

  useEffect(() => {
    if (mode === MODE_HLS) launchHls();
  }, [mode, quality, launchHls]);

  // ── Guard: no file / no device ────────────────────────────────────────────
  if (!file || !selectedDevice) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center text-center px-4">
        <span className="text-5xl mb-4">🎬</span>
        <h2 className="text-xl font-semibold text-white mb-2">No file selected</h2>
        <p className="text-sm text-gray-400 mb-6">Open a media file from the file explorer.</p>
        <button
          onClick={() => navigate("/device")}
          className="px-5 py-2 bg-brand hover:bg-brand-dark rounded-xl text-sm font-medium transition"
        >
          ← File Explorer
        </button>
      </div>
    );
  }

  const fileType = file.type;

  // ── Mode button helper ────────────────────────────────────────────────────
  const modeBtn = (m, label) => (
    <button
      key={m}
      onClick={() => setMode(m)}
      className={`px-3 py-1 text-xs rounded-lg transition border ${
        mode === m
          ? "bg-brand border-brand text-white"
          : "bg-surface border-surface-border text-gray-400 hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-surface text-white">
      {/* Header */}
      <header className="border-b border-surface-border bg-surface-card px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-400 hover:text-white transition px-2 py-1 rounded-lg hover:bg-surface-hover text-lg"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500">{selectedDevice.name}</p>
          <p className="text-sm font-medium text-white truncate">{file.name}</p>
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-lg bg-surface border border-surface-border ${
            fileType === "video"
              ? "text-blue-400"
              : fileType === "audio"
              ? "text-purple-400"
              : "text-green-400"
          }`}
        >
          {file.ext?.replace(".", "").toUpperCase() ?? fileType}
        </span>
      </header>

      {/* Player area */}
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* Streaming mode controls — only for video */}
        {fileType === "video" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 mr-1">Mode:</span>
            {modeBtn(MODE_DIRECT, "Direct")}

            {/* Transcode / HLS only available when server has FFmpeg (/media routes) */}
            {supportsAdvanced === true && (
              <>
                {modeBtn(MODE_TRANSCODE, "Transcode")}
                {modeBtn(MODE_HLS,       "HLS")}
              </>
            )}

            {/* Capability probing in progress */}
            {supportsAdvanced === null && infoLoading && (
              <span className="text-xs text-gray-600 italic">detecting…</span>
            )}

            {/* Mobile / unsupported server */}
            {supportsAdvanced === false && (
              <span className="text-xs text-gray-600 italic">Transcode &amp; HLS unavailable on this device</span>
            )}

            {(mode === MODE_TRANSCODE || mode === MODE_HLS) && supportsAdvanced && (
              <>
                <span className="text-xs text-gray-500 ml-3 mr-1">Quality:</span>
                {QUALITIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuality(q)}
                    className={`px-3 py-1 text-xs rounded-lg transition border ${
                      quality === q
                        ? "bg-brand border-brand text-white"
                        : "bg-surface border-surface-border text-gray-400 hover:text-white"
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </>
            )}

            {mediaInfo && !mediaInfo.browserCompatible && (
              <span className="ml-auto text-xs px-2 py-1 rounded-lg bg-yellow-900/40 border border-yellow-700 text-yellow-400">
                ⚠ Transcoding recommended ({mediaInfo.transcodeReason})
              </span>
            )}
          </div>
        )}

        {/* Player */}
        {fileType === "video" && (
          hlsLoading ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              ⏳ Starting HLS session…
            </div>
          ) : (
            videoSrc && (
              <VideoPlayer
                src={videoSrc}
                title={file.name}
                isHls={mode === MODE_HLS}
                subtitleUrl={subUrl}
              />
            )
          )
        )}

        {fileType === "audio" && directSrc && (
          <AudioPlayer src={directSrc} title={file.name} />
        )}

        {fileType === "image" && directSrc && (
          <ImageViewer src={directSrc} title={file.name} />
        )}

        {!["video", "audio", "image"].includes(fileType) && (
          <div className="flex flex-col items-center py-20 text-center">
            <span className="text-6xl mb-4">📄</span>
            <p className="text-gray-400">
              Preview not available for <strong>{file.ext}</strong> files.
            </p>
          </div>
        )}

        {/* Media metadata panel */}
        <div className="bg-surface-card border border-surface-border rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">
            Media Info
          </h3>

          {infoLoading && (
            <p className="text-xs text-gray-500 animate-pulse">Probing file…</p>
          )}
          {/* Only show error for non-404 failures (404 = mobile server, handled gracefully) */}
          {infoError && (
            <p className="text-xs text-red-400">Could not probe file: {infoError}</p>
          )}
          {supportsAdvanced === false && !infoLoading && (
            <p className="text-xs text-gray-600 mb-2">
              FFmpeg metadata unavailable — device doesn't support advanced streaming.
            </p>
          )}

          {mediaInfo && (
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-gray-500">Duration</span>
              <span className="text-white">{fmtDuration(mediaInfo.duration)}</span>

              {mediaInfo.resolution && (
                <>
                  <span className="text-gray-500">Resolution</span>
                  <span className="text-white">{mediaInfo.resolution}</span>
                </>
              )}
              {mediaInfo.fps && (
                <>
                  <span className="text-gray-500">Frame rate</span>
                  <span className="text-white">{mediaInfo.fps} fps</span>
                </>
              )}
              {mediaInfo.videoCodec && (
                <>
                  <span className="text-gray-500">Video codec</span>
                  <span className="text-white">{mediaInfo.videoCodec}</span>
                </>
              )}
              {mediaInfo.audioCodec && (
                <>
                  <span className="text-gray-500">Audio codec</span>
                  <span className="text-white">
                    {mediaInfo.audioCodec}
                    {mediaInfo.audioChannels ? ` (${mediaInfo.audioChannels}ch)` : ""}
                  </span>
                </>
              )}
              {mediaInfo.bitrate && (
                <>
                  <span className="text-gray-500">Bitrate</span>
                  <span className="text-white">
                    {(mediaInfo.bitrate / 1000).toFixed(0)} kbps
                  </span>
                </>
              )}
              {mediaInfo.sizeBytes && (
                <>
                  <span className="text-gray-500">File size</span>
                  <span className="text-white">{fmt(mediaInfo.sizeBytes)}</span>
                </>
              )}
              {mediaInfo.container && (
                <>
                  <span className="text-gray-500">Container</span>
                  <span className="text-white">{mediaInfo.container}</span>
                </>
              )}
              <span className="text-gray-500">Browser compat</span>
              <span className={mediaInfo.browserCompatible ? "text-green-400" : "text-yellow-400"}>
                {mediaInfo.browserCompatible ? "✓ Native" : `⚠ ${mediaInfo.transcodeReason ?? "needs transcode"}`}
              </span>
              <span className="text-gray-500">Subtitles</span>
              <span className={mediaInfo.hasEmbeddedSubtitles ? "text-green-400" : "text-gray-500"}>
                {mediaInfo.hasEmbeddedSubtitles ? "✓ Embedded" : "None"}
              </span>
            </div>
          )}

          {/* Basic file info always shown */}
          {!mediaInfo && !infoLoading && (
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-gray-500">Name</span>
              <span className="text-white truncate">{file.name}</span>
              <span className="text-gray-500">Type</span>
              <span className="text-white">{fileType}</span>
              {file.size != null && (
                <>
                  <span className="text-gray-500">Size</span>
                  <span className="text-white">{fmt(file.size)}</span>
                </>
              )}
              {file.mtime && (
                <>
                  <span className="text-gray-500">Modified</span>
                  <span className="text-white">
                    {new Date(file.mtime).toLocaleDateString()}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
