// discovery.js polls the local backend for discovered mDNS devices
// and keeps the list fresh every POLL_INTERVAL ms.

const POLL_INTERVAL = 5000;
const LOCAL_URL = "http://localhost:8000";

export async function fetchDiscoveredDevices() {
  try {
    const res = await fetch(`${LOCAL_URL}/devices`);
    if (!res.ok) throw new Error("Bad response");
    const data = await res.json();

    // Normalise: backend returns { devices: [...], advertising, name, port }
    const devices = (data.devices ?? []).map((svc) => ({
      id: svc.fqdn ?? svc.name,
      name: svc.name ?? "Unknown",
      host: svc.host ?? svc.referer?.address ?? "unknown",
      port: svc.port ?? 8000,
      type: svc.type ?? "streamnode",
      url: `http://${svc.host ?? svc.referer?.address ?? "localhost"}:${svc.port ?? 8000}`,
      online: true,
    }));

    return {
      devices,
      advertising: data.advertising ?? false,
      selfName: data.name ?? null,
    };
  } catch {
    return { devices: [], advertising: false, selfName: null };
  }
}

export function startPolling(callback, interval = POLL_INTERVAL) {
  callback(); // immediate first call
  const id = setInterval(callback, interval);
  return () => clearInterval(id);
}
