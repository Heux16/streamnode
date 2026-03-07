import { useRef, useState, useEffect } from "react";
import Hls from "hls.js";

/**
 * VideoPlayer
 *
 * Props:
 *   src         – stream / transcode / HLS playlist URL
 *   title       – optional label shown below the video
 *   isHls       – when true, src is an HLS playlist → loaded via hls.js
 *   subtitleUrl – optional URL for a .vtt subtitle track
 */
export default function VideoPlayer({ src, title, isHls = false, subtitleUrl }) {
  const videoRef  = useRef(null);
  const hlsRef    = useRef(null);
  const [buffering, setBuffering] = useState(false);
  const [error,     setError]     = useState(false);

  // ── Wire up source whenever src or isHls changes ──────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setError(false);
    setBuffering(true);

    // Destroy previous hls instance if any
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {}); // autoplay may be blocked
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setError(true);
          setBuffering(false);
        }
      });
    } else if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS (Safari)
      video.src = src;
      video.play().catch(() => {});
    } else {
      // Direct stream / transcode
      video.src = src;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, isHls]);

  return (
    <div className="relative w-full bg-black rounded-2xl overflow-hidden shadow-2xl">
      {/* Buffering spinner */}
      {buffering && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10 pointer-events-none">
          <div className="w-10 h-10 border-4 border-surface-border border-t-brand rounded-full animate-spin" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
          ⚠️ Cannot load video. Check device connection.
        </div>
      )}

      <video
        ref={videoRef}
        controls
        className="w-full max-h-[75vh] outline-none"
        onCanPlay={() => setBuffering(false)}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onError={() => { setError(true); setBuffering(false); }}
        crossOrigin="anonymous"
      >
        {/* Subtitle track — browser auto-shows CC button when present */}
        {subtitleUrl && (
          <track
            kind="subtitles"
            src={subtitleUrl}
            srcLang="en"
            label="Subtitles"
            default
          />
        )}
      </video>

      {title && (
        <div className="px-4 py-2 text-sm text-gray-400 truncate border-t border-surface-border">
          {title}
        </div>
      )}
    </div>
  );
}
