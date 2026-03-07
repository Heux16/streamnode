import { useState } from "react";

export default function ImageViewer({ src, title }) {
  const [scale, setScale] = useState(1);
  const [fitScreen, setFitScreen] = useState(true);
  const [error, setError] = useState(false);

  function zoomIn() {
    setFitScreen(false);
    setScale((s) => Math.min(s + 0.25, 5));
  }

  function zoomOut() {
    setFitScreen(false);
    setScale((s) => Math.max(s - 0.25, 0.25));
  }

  function resetFit() {
    setFitScreen(true);
    setScale(1);
  }

  return (
    <div className="flex flex-col items-center w-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 bg-surface-card border border-surface-border rounded-xl px-4 py-2">
        <button
          onClick={zoomOut}
          className="text-gray-400 hover:text-white transition text-lg px-1"
          title="Zoom Out"
        >
          🔍−
        </button>
        <span className="text-xs text-gray-500 w-12 text-center">
          {fitScreen ? "Fit" : `${Math.round(scale * 100)}%`}
        </span>
        <button
          onClick={zoomIn}
          className="text-gray-400 hover:text-white transition text-lg px-1"
          title="Zoom In"
        >
          🔍+
        </button>
        <div className="w-px h-5 bg-surface-border" />
        <button
          onClick={resetFit}
          className="text-xs text-brand hover:text-brand-light transition px-1"
          title="Fit to screen"
        >
          Fit
        </button>
      </div>

      {/* Image */}
      <div className="overflow-auto w-full max-h-[70vh] flex items-center justify-center bg-black rounded-2xl">
        {error ? (
          <div className="text-gray-400 text-sm py-20">
            ⚠️ Cannot load image.
          </div>
        ) : (
          <img
            src={src}
            alt={title}
            onError={() => setError(true)}
            style={{
              transform: `scale(${scale})`,
              maxWidth: fitScreen ? "100%" : "none",
              maxHeight: fitScreen ? "70vh" : "none",
              transition: "transform 0.2s ease",
            }}
            className="object-contain"
          />
        )}
      </div>

      {title && (
        <p className="mt-3 text-sm text-gray-500 truncate">{title}</p>
      )}
    </div>
  );
}
