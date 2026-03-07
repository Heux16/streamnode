import { useState, useEffect, useCallback } from "react";
import { getFiles } from "../services/api.js";

export function useFiles(folderPath) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchFiles = useCallback(async () => {
    if (!folderPath) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getFiles(folderPath);
      setFiles(data);
    } catch (err) {
      setError("Cannot load files. Check device connection.");
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
