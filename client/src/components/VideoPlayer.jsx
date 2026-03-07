import { useRef, useState, useEffect } from "react";

export default function VideoPlayer({ src, title }) {
  const videoRef = useRef(null);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
    setBuffering(true);
  }, [src]);

  return (
    <div className="relative w-full bg-black rounded-2xl overflow-hidden shadow-2xl">
      {buffering && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10 pointer-events-none">
          <div className="w-10 h-10 border-4 border-surface-border border-t-brand rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
          ⚠️ Cannot load video. Check device connection.
        </div>
      )}

      <video
        ref={videoRef}
        src={src}
        controls
        autoPlay
        className="w-full max-h-[75vh] outline-none"
        onCanPlay={() => setBuffering(false)}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onError={() => {
          setError(true);
          setBuffering(false);
        }}
      />

      {title && (
        <div className="px-4 py-2 text-sm text-gray-400 truncate border-t border-surface-border">
          {title}
        </div>
      )}
    </div>
  );
}
