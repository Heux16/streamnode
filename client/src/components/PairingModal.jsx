/**
 * Reusable pairing modal.
 *
 * Props:
 *   device    { url, name, host?, port? }
 *   onSuccess (token) => void   — called after successful pairing
 *   onClose   ()      => void   — called on dismiss
 */

import { useState, useRef, useEffect } from "react";
import { setBaseURL, requestPairingCode, verifyPairingCode } from "../services/api.js";
import { useDevice } from "../context/DeviceContext.jsx";

export default function PairingModal({ device, onSuccess, onClose }) {
  const { selectDevice, storeToken } = useDevice();
  const [step, setStep] = useState("idle");
  const [pairingCode, setPairingCode] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const inputRef = useRef(null);

  // Point the shared API client at the device being paired for the duration
  useEffect(() => {
    setBaseURL(device.url);
    return () => { /* caller restores baseURL as needed */ };
  }, [device.url]);

  async function handleRequest() {
    setStep("requesting");
    setErrMsg("");
    try {
      await requestPairingCode();
      setPairingCode("");
      setStep("show_code");
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch {
      setErrMsg("Could not reach device. Make sure it's running StreamNode.");
      setStep("error");
    }
  }

  async function handleVerify() {
    if (!pairingCode.trim()) return;
    setStep("verifying");
    setErrMsg("");
    try {
      const deviceName = `Browser-${window.location.hostname}`;
      const res = await verifyPairingCode(pairingCode.trim(), deviceName);
      storeToken(device.url, res.token);
      selectDevice(device, res.token);
      onSuccess(res.token);
    } catch (err) {
      const msg = err.response?.data?.error || "Invalid or expired code. Try again.";
      setErrMsg(msg);
      setStep("error");
    }
  }

  const displayHost = device.host ?? (new URL(device.url).hostname);
  const displayPort = device.port ?? (new URL(device.url).port ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-sm p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">🔐 Pair with Device</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition text-xl leading-none">×</button>
        </div>

        <p className="text-sm text-gray-400 mb-5">
          Connect to <span className="text-white font-medium">{device.name}</span> at{" "}
          <code className="text-brand-light text-xs">{displayHost}:{displayPort}</code>
        </p>

        {step === "idle" && (
          <button onClick={handleRequest}
            className="w-full py-2.5 bg-brand hover:bg-brand-dark rounded-xl text-sm font-medium transition">
            Request Pairing Code
          </button>
        )}

        {step === "requesting" && (
          <div className="flex items-center justify-center gap-2 py-4 text-gray-400 text-sm">
            <span className="animate-spin">⏳</span> Requesting code…
          </div>
        )}

        {step === "show_code" && (
          <>
            <div className="bg-brand/10 border border-brand/30 rounded-xl p-3 mb-4 text-center">
              <p className="text-brand-light text-sm font-medium mb-0.5">📟 Code generated on device</p>
              <p className="text-gray-400 text-xs">
                Look at <span className="text-white font-medium">{device.name}</span> for the 6-digit code, then enter it below.
              </p>
            </div>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="Enter 6-digit code"
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full text-center text-2xl tracking-widest py-2 mb-4 bg-surface border border-surface-border rounded-xl text-white outline-none focus:border-brand transition"
            />
            <button
              onClick={handleVerify}
              disabled={pairingCode.length !== 6}
              className="w-full py-2.5 bg-brand hover:bg-brand-dark disabled:opacity-40 rounded-xl text-sm font-medium transition">
              Confirm Pairing
            </button>
          </>
        )}

        {step === "verifying" && (
          <div className="flex items-center justify-center gap-2 py-4 text-gray-400 text-sm">
            <span className="animate-spin">⏳</span> Verifying…
          </div>
        )}

        {step === "error" && (
          <>
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4 text-red-400 text-sm">
              ⚠️ {errMsg}
            </div>
            <button onClick={() => setStep("idle")}
              className="w-full py-2.5 bg-surface border border-surface-border hover:border-brand rounded-xl text-sm font-medium transition">
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
