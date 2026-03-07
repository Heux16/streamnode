import { useState, useEffect, useCallback } from "react";
import { getFiles, clearToken, getBaseURL } from "../services/api.js";

export function useFiles(folderPath) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchFiles = useCallback(async () => {
    // null = use server default (valid); undefined = no device selected (skip)
    if (folderPath === undefined) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getFiles(folderPath);
      setFiles(data);
    } catch (err) {
      if (err.response?.status === 401) {
        // Token expired or server restarted — clear it so next tap triggers re-pairing
        clearToken(getBaseURL());
        setError("UNAUTHORIZED");
      } else {
        setError("Cannot load files. Check device connection.");
      }
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [folderPath]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  return { files, loading, error, refresh: fetchFiles };
}
