import { useRef, useState } from "react";

export default function AudioPlayer({ src, title }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    playing ? el.pause() : el.play();
    setPlaying(!playing);
  }

  function onTimeUpdate() {
    const el = audioRef.current;
    if (!el || !el.duration) return;
    setProgress((el.currentTime / el.duration) * 100);
  }

  function seek(e) {
    const el = audioRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    el.currentTime = pct * el.duration;
  }

  function fmt(s) {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${sec}`;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm rounded-2xl bg-surface-card border border-surface-border">
        ⚠️ Cannot load audio. Check device connection.
      </div>
    );
  }

  return (
    <div className="bg-surface-card border border-surface-border rounded-2xl p-6 w-full max-w-lg mx-auto shadow-lg">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => setPlaying(false)}
        onError={() => setError(true)}
      />

      {/* Album art placeholder */}
      <div className="flex items-center justify-center w-24 h-24 bg-surface rounded-xl mb-4 mx-auto text-4xl">
        🎵
      </div>

      <p className="text-center font-semibold text-white truncate mb-1">{title}</p>
      <p className="text-center text-xs text-gray-500 mb-4">Audio</p>

      {/* Seek bar */}
      <div
        className="w-full h-2 bg-surface rounded-full cursor-pointer mb-2 relative"
        onClick={seek}
      >
        <div
          className="h-2 bg-brand rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex justify-between text-xs text-gray-500 mb-4">
        <span>{fmt(audioRef.current?.currentTime)}</span>
        <span>{fmt(duration)}</span>
      </div>

      {/* Controls */}
      <div className="flex justify-center">
        <button
          onClick={toggle}
          className="w-14 h-14 rounded-full bg-brand hover:bg-brand-dark flex items-center justify-center
            text-white text-2xl transition-all shadow-lg"
        >
          {playing ? "⏸" : "▶"}
        </button>
      </div>
    </div>
  );
}
