import { useLocation, useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { useDevice } from "../context/DeviceContext.jsx";
import { streamFile } from "../services/api.js";
import VideoPlayer from "../components/VideoPlayer.jsx";
import AudioPlayer from "../components/AudioPlayer.jsx";
import ImageViewer from "../components/ImageViewer.jsx";

export default function PlayerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedDevice } = useDevice();

  const { file, folderPath } = location.state ?? {};

  const src = useMemo(() => {
    if (!file) return null;
    return streamFile({ filename: file.name, folderPath });
  }, [file, folderPath]);

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
      <main className="max-w-4xl mx-auto px-4 py-8">
        {fileType === "video" && src && (
          <VideoPlayer src={src} title={file.name} />
        )}

        {fileType === "audio" && src && (
          <AudioPlayer src={src} title={file.name} />
        )}

        {fileType === "image" && src && (
          <ImageViewer src={src} title={file.name} />
        )}

        {!["video", "audio", "image"].includes(fileType) && (
          <div className="flex flex-col items-center py-20 text-center">
            <span className="text-6xl mb-4">📄</span>
            <p className="text-gray-400">
              Preview not available for <strong>{file.ext}</strong> files.
            </p>
          </div>
        )}

        {/* File info */}
        <div className="mt-6 bg-surface-card border border-surface-border rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">
            File Info
          </h3>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-gray-500">Name</span>
            <span className="text-white truncate">{file.name}</span>
            <span className="text-gray-500">Type</span>
            <span className="text-white">{fileType}</span>
            {file.size != null && (
              <>
                <span className="text-gray-500">Size</span>
                <span className="text-white">
                  {file.size < 1024 * 1024
                    ? `${(file.size / 1024).toFixed(1)} KB`
                    : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
                </span>
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
            <span className="text-gray-500">Source</span>
            <span className="text-gray-400 text-xs truncate">{src}</span>
          </div>
        </div>
      </main>
    </div>
  );
}
