import { useState, useEffect, useCallback } from "react";
import { getFiles } from "../services/api.js";

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
