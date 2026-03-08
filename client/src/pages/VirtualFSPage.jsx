import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDevice } from "../context/DeviceContext.jsx";
import {
  getVirtualFiles,
  searchGlobal,
  getStorageReport,
  refreshVirtualIndex,
  loadToken,
  resetToLaptop,
} from "../services/api.js";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import PairingModal from "../components/PairingModal.jsx";

// ── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_ICONS = {
  Videos:    "🎬",
  Music:     "🎵",
  Photos:    "🖼️",
  Documents: "📄",
  Other:     "📁",
};

const CATEGORY_ORDER = ["Videos", "Music", "Photos", "Documents", "Other"];

function fmt(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  if (bytes >= 1e12) return (bytes / 1e12).toFixed(1) + " TB";
  if (bytes >= 1e9)  return (bytes / 1e9).toFixed(1)  + " GB";
  if (bytes >= 1e6)  return (bytes / 1e6).toFixed(1)  + " MB";
  return Math.round(bytes / 1e3) + " KB";
}

function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── File row component ────────────────────────────────────────────────────────

function FileRow({ file, onPlay }) {
  const typeIcon =
    file.type === "video" ? "🎬" :
    file.type === "audio" ? "🎵" :
    file.type === "image" ? "🖼️" :
    file.type === "pdf"   ? "📄" :
    file.type === "text"  ? "📝" : "📁";

  return (
    <div
      onClick={() => onPlay(file)}
      className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-surface-hover cursor-pointer transition group"
    >
      <span className="text-xl w-8 text-center flex-shrink-0">{typeIcon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate group-hover:text-brand-light transition">
          {file.name}
        </p>
        <p className="text-xs text-gray-500 truncate">{file.path}</p>
      </div>
      <div className="flex-shrink-0 flex flex-col items-end gap-1">
        <span className="text-xs bg-brand/20 text-brand-light border border-brand/30 px-2 py-0.5 rounded-full">
          {file.deviceName}
        </span>
        <span className="text-xs text-gray-600">{fmt(file.size)}</span>
      </div>
    </div>
  );
}

// ── Storage bar component ─────────────────────────────────────────────────────

function StorageBar({ report }) {
  if (!report) return null;
  return (
    <div className="mt-6 bg-surface-card border border-surface-border rounded-2xl p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">💾 Storage Overview</h3>

      {/* Per-device rows */}
      <div className="flex flex-col gap-2 mb-3">
        {report.devices.map((d, i) => (
          <div key={i}>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>{d.name}</span>
              <span>{d.usedFmt} / {d.totalFmt} ({d.pctUsed}%)</span>
            </div>
            <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  d.pctUsed > 90 ? "bg-red-500" :
                  d.pctUsed > 75 ? "bg-yellow-500" : "bg-brand"
                }`}
                style={{ width: `${Math.min(d.pctUsed, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="flex justify-between text-xs text-gray-500 pt-2 border-t border-surface-border">
        <span>Total: {report.totalCapacityFmt}</span>
        <span>Used: {report.totalUsedFmt}</span>
        <span>Free: {report.totalFreeFmt}</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VirtualFSPage() {
  const navigate = useNavigate();
  const { selectDevice } = useDevice();

  const [activeCategory, setActiveCategory] = useState("Videos");
  const [rawSearch,      setRawSearch]      = useState("");
  const [virtualData,    setVirtualData]    = useState(null);   // { categories, total }
  const [searchResults,  setSearchResults]  = useState(null);   // null = no active search
  const [storageReport,  setStorageReport]  = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [refreshing,     setRefreshing]     = useState(false);
  const [error,          setError]          = useState(null);
  // file pending play that triggered a pairing prompt
  const [pairingTarget,  setPairingTarget]  = useState(null);

  const debouncedSearch = useDebounced(rawSearch, 400);

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    // Always point at the laptop server, regardless of which device was last
    // selected in the file explorer.
    resetToLaptop();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Bust the cache so devices discovered after server start are included.
        await refreshVirtualIndex().catch(() => {});
        const [vf, sr] = await Promise.all([
          getVirtualFiles(),
          getStorageReport().catch(() => null),
        ]);
        setVirtualData(vf);
        setStorageReport(sr);
      } catch (e) {
        setError(e.response?.data?.error || e.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Debounced global search ───────────────────────────────────────────────
  useEffect(() => {
    if (!debouncedSearch.trim()) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    async function doSearch() {
      setSearchLoading(true);
      try {
        const results = await searchGlobal(debouncedSearch.trim());
        if (!cancelled) setSearchResults(results);
      } catch { /* ignore */ } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }
    doSearch();
    return () => { cancelled = true; };
  }, [debouncedSearch]);

  // ── Refresh cache ─────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshVirtualIndex();
      const [vf, sr] = await Promise.all([
        getVirtualFiles(),
        getStorageReport().catch(() => null),
      ]);
      setVirtualData(vf);
      setStorageReport(sr);
      setSearchResults(null);
      setRawSearch("");
    } catch { /* ignore */ } finally {
      setRefreshing(false);
    }
  }, []);

  // ── Navigate to player for a file entry ──────────────────────────────────
  const playFile = useCallback((file) => {
    selectDevice({ url: file.deviceUrl, name: file.deviceName });
    const folderPath = file.path.substring(0, file.path.lastIndexOf("/"));
    navigate("/player", { state: { file, folderPath } });
  }, [navigate, selectDevice]);

  const handlePlay = useCallback((file) => {
    if (!loadToken(file.deviceUrl)) {
      // No token — show inline pairing modal, then play automatically on success
      setPairingTarget(file);
      return;
    }
    playFile(file);
  }, [playFile]);

  // ── Current file list to display ─────────────────────────────────────────
  const displayFiles = useMemo(() => {
    if (searchResults !== null) return searchResults;
    if (!virtualData) return [];
    return virtualData.categories?.[activeCategory] ?? [];
  }, [searchResults, virtualData, activeCategory]);

  const categoryCounts = useMemo(() => {
    if (!virtualData?.categories) return {};
    const out = {};
    for (const cat of CATEGORY_ORDER) {
      out[cat] = virtualData.categories[cat]?.length ?? 0;
    }
    return out;
  }, [virtualData]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-surface text-white flex flex-col">
      {/* Inline pairing modal — shown when a file's device isn't paired yet */}
      {pairingTarget && (
        <PairingModal
          device={{ url: pairingTarget.deviceUrl, name: pairingTarget.deviceName }}
          onSuccess={() => {
            const file = pairingTarget;
            setPairingTarget(null);
            resetToLaptop(); // restore laptop client after pairing with remote
            // small delay so token is stored before playFile reads it
            setTimeout(() => playFile(file), 50);
          }}
          onClose={() => { setPairingTarget(null); resetToLaptop(); }}
        />
      )}
      {/* Header */}
      <header className="border-b border-surface-border bg-surface-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="text-gray-400 hover:text-white transition mr-1"
            title="Back to Dashboard"
          >
            ←
          </button>
          <span className="text-2xl">🗄️</span>
          <div>
            <h1 className="text-xl font-bold text-white">Virtual Filesystem</h1>
            <p className="text-xs text-gray-500">
              {loading ? "Loading…" : `${virtualData?.total ?? 0} files across all devices`}
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="text-sm text-gray-400 hover:text-brand-light transition px-3 py-2 rounded-lg hover:bg-surface-hover disabled:opacity-50"
          title="Refresh index (re-scans all devices)"
        >
          {refreshing ? "Refreshing…" : "↻ Refresh"}
        </button>
      </header>

      <main className="max-w-5xl mx-auto w-full px-4 py-6 flex-1">
        {/* Search bar */}
        <div className="relative mb-6">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            type="text"
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            placeholder="Search across all devices…"
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-surface-card border border-surface-border text-white placeholder-gray-500 focus:outline-none focus:border-brand transition"
          />
          {rawSearch && (
            <button
              onClick={() => { setRawSearch(""); setSearchResults(null); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition"
            >
              ✕
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center py-24 text-center">
            <span className="text-5xl mb-4">⚠️</span>
            <p className="text-red-400 font-medium">{error}</p>
            <p className="text-xs text-gray-500 mt-2">Make sure the laptop server is running.</p>
          </div>
        ) : (
          <>
            {/* Category tabs — hidden while a search is active */}
            {searchResults === null && (
              <div className="flex gap-2 flex-wrap mb-5">
                {CATEGORY_ORDER.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition border
                      ${activeCategory === cat
                        ? "bg-brand/20 text-brand-light border-brand/40"
                        : "bg-surface-card text-gray-400 border-surface-border hover:border-brand/40 hover:text-brand-light"
                      }`}
                  >
                    <span>{CATEGORY_ICONS[cat]}</span>
                    <span>{cat}</span>
                    <span className="text-xs opacity-70">({categoryCounts[cat] ?? 0})</span>
                  </button>
                ))}
              </div>
            )}

            {/* Search status */}
            {searchResults !== null && (
              <div className="flex items-center gap-2 mb-4 text-sm text-gray-400">
                {searchLoading
                  ? <LoadingSpinner />
                  : <span>Found <strong className="text-white">{searchResults.length}</strong> results for "<span className="text-brand-light">{debouncedSearch}</span>"</span>
                }
              </div>
            )}

            {/* File list */}
            {displayFiles.length === 0 ? (
              <div className="flex flex-col items-center py-20 text-center text-gray-500">
                <span className="text-5xl mb-3">{searchResults !== null ? "🔍" : CATEGORY_ICONS[activeCategory]}</span>
                <p className="text-sm">
                  {searchResults !== null
                    ? `No files match "${debouncedSearch}"`
                    : `No ${activeCategory.toLowerCase()} found across connected devices.`}
                </p>
              </div>
            ) : (
              <div className="bg-surface-card border border-surface-border rounded-2xl divide-y divide-surface-border overflow-hidden">
                {displayFiles.map((file) => (
                  <FileRow key={file.id} file={file} onPlay={handlePlay} />
                ))}
              </div>
            )}

            {/* Storage bar */}
            <StorageBar report={storageReport} />
          </>
        )}
      </main>
    </div>
  );
}
