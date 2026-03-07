import { useNavigate } from "react-router-dom";
import { useDevice } from "../context/DeviceContext.jsx";

const TYPE_ICONS = {
  folder: "📁",
  video: "🎬",
  audio: "🎵",
  image: "🖼",
  pdf: "📕",
  text: "📄",
  file: "📦",
};

const TYPE_COLORS = {
  folder: "text-yellow-400",
  video: "text-blue-400",
  audio: "text-purple-400",
  image: "text-green-400",
  pdf: "text-red-400",
  text: "text-gray-400",
  file: "text-gray-500",
};

function formatSize(bytes) {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(mtime) {
  if (!mtime) return "";
  return new Date(mtime).toLocaleDateString();
}

export default function FileItem({ file, currentPath }) {
  const navigate = useNavigate();
  const { setCurrentPath } = useDevice();

  const icon = TYPE_ICONS[file.type] ?? "📦";
  const color = TYPE_COLORS[file.type] ?? "text-gray-400";

  function handleClick() {
    const fullPath = `${currentPath}/${file.name}`;

    if (file.isDirectory) {
      setCurrentPath(fullPath);
    } else if (["video", "audio", "image"].includes(file.type)) {
      navigate("/player", {
        state: { file, folderPath: currentPath },
      });
    }
  }

  return (
    <button
      onClick={handleClick}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl
        hover:bg-surface-hover transition-all duration-150 group text-left"
    >
      <span className={`text-xl flex-shrink-0 ${color}`}>{icon}</span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate group-hover:text-brand-light transition-colors">
          {file.name}
        </p>
        {file.ext && (
          <p className="text-xs text-gray-600 uppercase">{file.ext.replace(".", "")}</p>
        )}
      </div>

      <div className="flex items-center gap-6 flex-shrink-0 text-xs text-gray-500">
        {!file.isDirectory && (
          <span className="hidden sm:block">{formatSize(file.size)}</span>
        )}
        <span className="hidden md:block">{formatDate(file.mtime)}</span>
        {file.isDirectory && (
          <span className="text-gray-600">→</span>
        )}
      </div>
    </button>
  );
}
