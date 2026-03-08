import { useDevices } from "../hooks/useDevices.js";
import DeviceCard from "../components/DeviceCard.jsx";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import PairingModal from "../components/PairingModal.jsx";
import { useDevice } from "../context/DeviceContext.jsx";
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const { devices, advertising, setAdvertising, loading, error, refresh } = useDevices();
  const { pairingDevice, setPairingDevice } = useDevice();
  const [adLoading, setAdLoading] = useState(false);
  const [trustedDevices, setTrustedDevices] = useState([]);
  const [devLoading, setDevLoading] = useState(false);

  async function loadTrustedDevices() {
    setDevLoading(true);
    try {
      const r = await fetch('http://localhost:8000/pair/local-devices');
      if (r.ok) setTrustedDevices(await r.json());
    } catch { /* server not running */ }
    finally { setDevLoading(false); }
  }

  async function revokeDevice(name) {
    try {
      await fetch(`http://localhost:8000/pair/local-devices/${encodeURIComponent(name)}`, { method: 'DELETE' });
      setTrustedDevices(prev => prev.filter(d => d.deviceName !== name));
    } catch { /* ignore */ }
  }

  useEffect(() => { loadTrustedDevices(); }, []);

  // Poll the laptop server for a pending pairing code (remote device wants to pair)
  const [incomingCode, setIncomingCode] = useState(null); // { code, expiresIn }
  const [dismissed, setDismissed] = useState(null); // last dismissed code
  useEffect(() => {
    async function check() {
      try {
        const r = await fetch('http://localhost:8000/pair/pending');
        if (!r.ok) return;
        const data = await r.json();
        if (data.code && data.code !== dismissed) {
          setIncomingCode(data);
        } else if (!data.code) {
          setIncomingCode(null);
        }
      } catch { /* server not running */ }
    }
    check();
    const id = setInterval(check, 3000);
    return () => clearInterval(id);
  }, [dismissed]);

  async function toggleAdvertise() {
    // Always target the LOCAL laptop server via its own hostname (never the
    // mobile device URL that the shared axios client may have switched to).
    const LOCAL = `http://${window.location.hostname}:8000`;
    setAdLoading(true);
    try {
      const endpoint = advertising
        ? `${LOCAL}/devices/advertise/off`
        : `${LOCAL}/devices/advertise/on`;
      const r = await fetch(endpoint, { method: 'POST' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      // Update advertising flag directly from the response — do NOT call
      // refresh() here because that would probe all discovered devices
      // (including mobile phone IPs) unnecessarily on every button click.
      setAdvertising(data.advertising ?? !advertising);
    } catch (e) {
      console.error('[advertise toggle]', e.message);
    } finally {
      setAdLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface text-white">
      {/* Pairing modal */}
      {pairingDevice && (
        <PairingModal
          device={pairingDevice}
          onSuccess={() => { setPairingDevice(null); navigate("/device"); }}
          onClose={() => setPairingDevice(null)}
        />
      )}

      {/* Incoming pairing request banner */}
      {incomingCode && (
        <div className="fixed top-4 right-4 z-50 bg-surface-card border border-brand/50 rounded-2xl shadow-2xl p-4 w-72">
          <div className="flex items-start justify-between mb-2">
            <p className="text-sm font-semibold text-white">🔐 Pairing Request</p>
            <button
              onClick={() => { setDismissed(incomingCode.code); setIncomingCode(null); }}
              className="text-gray-500 hover:text-white transition text-lg leading-none ml-2"
            >×</button>
          </div>
          <p className="text-xs text-gray-400 mb-3">A device wants to pair. Share this code:</p>
          <div className="text-3xl font-mono font-bold tracking-widest text-brand-light text-center bg-brand/10 rounded-xl py-2 mb-2">
            {incomingCode.code}
          </div>
          <p className="text-xs text-gray-500 text-center">Expires in {incomingCode.expiresIn}s</p>
        </div>
      )}

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
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/virtual')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all bg-surface border border-surface-border text-gray-400 hover:border-brand hover:text-brand-light"
          >
            🗄 Virtual FS
          </button>
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
        </div>
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

        {/* Trusted Devices */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">🔒 Trusted Devices</h2>
            <button
              onClick={loadTrustedDevices}
              disabled={devLoading}
              className="text-sm text-gray-400 hover:text-brand-light transition px-3 py-1 rounded-lg hover:bg-surface-hover"
            >
              ↻ Refresh
            </button>
          </div>
          {devLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : trustedDevices.length === 0 ? (
            <p className="text-sm text-gray-500">No paired devices yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {trustedDevices.map((d) => (
                <div key={d.deviceName} className="flex items-center justify-between bg-surface-card border border-surface-border rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-white">{d.deviceName}</p>
                    <p className="text-xs text-gray-500">Paired {d.pairedAt}</p>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Revoke access for "${d.deviceName}"?`)) revokeDevice(d.deviceName);
                    }}
                    className="text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-3 py-1.5 rounded-lg font-medium transition"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

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
