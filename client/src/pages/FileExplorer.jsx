import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useDevice } from "../context/DeviceContext.jsx";
import { useFiles } from "../hooks/useFiles.js";
import FileItem from "../components/FileItem.jsx";
import Breadcrumb from "../components/Breadcrumb.jsx";
import LoadingSpinner from "../components/LoadingSpinner.jsx";

const SORT_OPTIONS = [
  { label: "Name", key: "name" },
  { label: "Size", key: "size" },
  { label: "Date", key: "mtime" },
];

export default function FileExplorer() {
  const navigate = useNavigate();
  const { selectedDevice, currentPath, clearDevice } = useDevice();
  const { files, loading, error, refresh } = useFiles(currentPath);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortAsc, setSortAsc] = useState(true);

  function toggleSort(key) {
    if (sortKey === key) setSortAsc((a) => !a);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  const processed = useMemo(() => {
    let result = files;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((f) => f.name.toLowerCase().includes(q));
    }

    result = [...result].sort((a, b) => {
      // folders first
      if (a.isDirectory !== b.isDirectory)
        return a.isDirectory ? -1 : 1;

      let av = a[sortKey] ?? "";
      let bv = b[sortKey] ?? "";
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();

      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });

    return result;
  }, [files, search, sortKey, sortAsc]);

  if (!selectedDevice) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center text-center px-4">
        <span className="text-5xl mb-4">📡</span>
        <h2 className="text-xl font-semibold text-white mb-2">No device selected</h2>
        <p className="text-sm text-gray-400 mb-6">Go back to the dashboard and select a device.</p>
        <button
          onClick={() => navigate("/")}
          className="px-5 py-2 bg-brand hover:bg-brand-dark rounded-xl text-sm font-medium transition"
        >
          ← Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-white">
      {/* Header */}
      <header className="border-b border-surface-border bg-surface-card px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/")}
          className="text-gray-400 hover:text-white transition text-lg px-2 py-1 rounded-lg hover:bg-surface-hover"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500">{selectedDevice.name}</p>
          <Breadcrumb />
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="text-gray-400 hover:text-brand-light transition p-2 rounded-lg hover:bg-surface-hover"
          title="Refresh"
        >
          ↻
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Search & Sorting row */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          {/* Search */}
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
            <input
              type="text"
              placeholder="Search files…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-surface-card border border-surface-border rounded-xl
                text-sm text-white placeholder-gray-600 outline-none focus:border-brand transition"
            />
          </div>

          {/* Sort buttons */}
          <div className="flex items-center gap-1 bg-surface-card border border-surface-border rounded-xl px-2 py-1">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => toggleSort(opt.key)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition
                  ${sortKey === opt.key
                    ? "bg-brand text-white"
                    : "text-gray-400 hover:text-white"
                  }`}
              >
                {opt.label}
                {sortKey === opt.key && (sortAsc ? " ↑" : " ↓")}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error === "UNAUTHORIZED" && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-5 mb-4 text-center">
            <p className="text-yellow-400 font-semibold mb-1">🔒 Session Expired</p>
            <p className="text-gray-400 text-sm mb-4">Your pairing token has expired. Go back and pair again.</p>
            <button
              onClick={() => { clearDevice(); navigate("/"); }}
              className="px-4 py-2 bg-brand hover:bg-brand-dark rounded-xl text-sm font-medium transition"
            >
              ← Back to Devices
            </button>
          </div>
        )}
        {error && error !== "UNAUTHORIZED" && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4 text-red-400 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Loading */}
        {loading && <LoadingSpinner label="Loading files…" />}

        {/* File list */}
        {!loading && processed.length > 0 && (
          <div className="bg-surface-card border border-surface-border rounded-2xl divide-y divide-surface-border overflow-hidden">
            {processed.map((file) => (
              <FileItem key={file.name} file={file} currentPath={currentPath} />
            ))}
          </div>
        )}

        {/* Count */}
        {!loading && files.length > 0 && (
          <p className="mt-3 text-xs text-gray-600 text-right">
            {processed.length} item{processed.length !== 1 ? "s" : ""}
            {search && ` matching "${search}"`}
          </p>
        )}

        {/* Empty */}
        {!loading && processed.length === 0 && !error && (
          <div className="flex flex-col items-center py-20 text-center">
            <span className="text-5xl mb-4">📂</span>
            <p className="text-gray-400 text-sm">
              {search ? `No files matching "${search}"` : "This folder is empty"}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
