// discovery.js polls the local backend for discovered mDNS devices
// and keeps the list fresh every POLL_INTERVAL ms.
//
// Mobile devices (Android) advertise on the same _streamnode._tcp.local mDNS
// service type and will appear automatically in the devices list once the
// phone's StreamNode app is running.  You can also add a mobile node manually
// using addManualDevice(ip, port).

const POLL_INTERVAL = 5000;
const LOCAL_URL = `http://${window.location.hostname}:8000`; // ✅ auto resolves

export async function fetchDiscoveredDevices() {
  try {
    const res = await fetch(`${LOCAL_URL}/devices`);
    if (!res.ok) throw new Error("Bad response");
    const data = await res.json();

    // Normalise: backend returns { devices: [...], advertising, name, port }
    // Use svc.addresses[0] (actual IP) not svc.host (.local mDNS name that may
    // not resolve on all platforms/networks).
    const devices = (data.devices ?? []).map((svc) => {
      const ip =
        svc.addresses?.[0] ??
        svc.referer?.address ??
        svc.host ??
        "unknown";
      const port = svc.port ?? 8000;
      return {
        id: svc.fqdn ?? `${ip}:${port}`,
        name: svc.name ?? "Unknown",
        host: ip,
        port,
        type: svc.type ?? "streamnode",
        txt: svc.txt ?? {},
        url: `http://${ip}:${port}`,
        online: true,
      };
    });

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

/**
 * Probe a known IP:port directly (useful when mDNS auto-discovery is
 * blocked by the network, e.g. AP-isolation on some routers).
 *
 * Returns a normalised device object or null if unreachable.
 *
 * @param {string} ip   - e.g. "192.168.1.110"
 * @param {number} port - e.g. 9000 (mobile default)
 */
export async function probeDevice(ip, port = 9000) {
  try {
    const res = await fetch(`http://${ip}:${port}/device`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const info = await res.json();
    return {
      id:     `${ip}:${port}`,
      name:   info.name ?? `StreamNode@${ip}`,
      host:   ip,
      port,
      type:   "streamnode",
      os:     info.os ?? "unknown",
      url:    `http://${ip}:${port}`,
      online: true,
      manual: true,
    };
  } catch {
    return null;
  }
}
