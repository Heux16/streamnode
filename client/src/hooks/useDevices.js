import { useState, useEffect, useCallback } from "react";
import { fetchDiscoveredDevices, startPolling } from "../services/discovery.js";

export function useDevices() {
  const [devices, setDevices] = useState([]);
  const [advertising, setAdvertising] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const result = await fetchDiscoveredDevices();
      setDevices(result.devices);
      setAdvertising(result.advertising);
      setError(null);
    } catch (err) {
      setError("Cannot reach local backend");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stop = startPolling(refresh);
    return stop;
  }, [refresh]);

  return { devices, advertising, loading, error, refresh };
}
