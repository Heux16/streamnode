import { useDevices } from "../hooks/useDevices.js";
import DeviceCard from "../components/DeviceCard.jsx";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import { advertiseOn, advertiseOff } from "../services/api.js";
import { useState } from "react";

export default function Dashboard() {
  const { devices, advertising, loading, error, refresh } = useDevices();
  const [adLoading, setAdLoading] = useState(false);

  async function toggleAdvertise() {
    setAdLoading(true);
    try {
      advertising ? await advertiseOff() : await advertiseOn();
      await refresh();
    } finally {
      setAdLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface text-white">
      {/* Header */}
      <header className="border-b border-surface-border bg-surface-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📡</span>
          <div>
            <h1 className="text-xl font-bold text-white">StreamNode</h1>
            <p className="text-xs text-gray-500">Local Network Streaming</p>
          </div>
        </div>

        {/* Advertise toggle */}
        <button
          onClick={toggleAdvertise}
          disabled={adLoading}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all
            ${
              advertising
                ? "bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30"
                : "bg-surface border border-surface-border text-gray-400 hover:border-brand hover:text-brand-light"
            }
            ${adLoading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <span className={`w-2 h-2 rounded-full ${advertising ? "bg-green-400" : "bg-gray-600"}`} />
          {adLoading ? "…" : advertising ? "Advertising" : "Start Advertising"}
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Status bar */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold">Available Devices</h2>
            <p className="text-gray-500 text-sm mt-1">
              {loading
                ? "Scanning network…"
                : `${devices.length} device${devices.length !== 1 ? "s" : ""} found`}
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="text-sm text-gray-400 hover:text-brand-light transition px-3 py-2 rounded-lg hover:bg-surface-hover"
          >
            ↻ Refresh
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-red-400 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Loading */}
        {loading && <LoadingSpinner label="Scanning network…" />}

        {/* Device grid */}
        {!loading && devices.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {devices.map((device) => (
              <DeviceCard key={device.id} device={device} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && devices.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="text-6xl mb-4">🔍</span>
            <h3 className="text-lg font-semibold text-gray-300 mb-2">No devices found</h3>
            <p className="text-sm text-gray-500 max-w-xs">
              Make sure other devices are running StreamNode and advertising on the same network.
            </p>
            <button
              onClick={refresh}
              className="mt-6 px-5 py-2 bg-brand hover:bg-brand-dark rounded-xl text-sm font-medium transition"
            >
              Scan Again
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
