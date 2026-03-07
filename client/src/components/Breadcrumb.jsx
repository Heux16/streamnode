import { useDevice } from "../context/DeviceContext.jsx";

export default function Breadcrumb() {
  const { currentPath, setCurrentPath } = useDevice();

  if (!currentPath) {
    return (
      <nav className="flex items-center gap-1 text-sm">
        <span className="text-gray-400">Root</span>
      </nav>
    );
  }

  const isAbsolute = currentPath.startsWith("/");

  // "./shared/movies/Marvel" → ["shared", "movies", "Marvel"]
  // "/storage/emulated/0/Movies" → ["storage", "emulated", "0", "Movies"]
  const parts = currentPath
    .replace(/^\.\//, "")
    .split("/")
    .filter(Boolean);

  function navigateTo(index) {
    const segments = parts.slice(0, index + 1);
    const newPath = isAbsolute
      ? "/" + segments.join("/")
      : "./" + segments.join("/");
    setCurrentPath(newPath);
  }

  return (
    <nav className="flex items-center gap-1 flex-wrap text-sm">
      {parts.map((part, idx) => {
        const isLast = idx === parts.length - 1;
        return (
          <span key={idx} className="flex items-center gap-1">
            {idx > 0 && <span className="text-gray-600">›</span>}
            {isLast ? (
              <span className="text-white font-medium">{part}</span>
            ) : (
              <button
                onClick={() => navigateTo(idx)}
                className="text-gray-400 hover:text-brand-light transition-colors"
              >
                {part}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
