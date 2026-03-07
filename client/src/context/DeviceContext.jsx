import { createContext, useContext, useState, useCallback } from "react";
import { setBaseURL, loadToken, saveToken } from "../services/api.js";

const DeviceContext = createContext(null);

export function DeviceProvider({ children }) {
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [currentPath, setCurrentPath] = useState(undefined);
  const [fileList, setFileList] = useState([]);
  const [token, setToken] = useState(null);
  // When set, Dashboard shows the pairing modal for this device
  const [pairingDevice, setPairingDevice] = useState(null);

  const selectDevice = useCallback((device, tkn) => {
    setSelectedDevice(device);
    setBaseURL(device.url);
    // Use provided token, or look up from localStorage (persisted from previous pairing)
    const resolved = tkn || loadToken(device.url);
    setToken(resolved);
    setCurrentPath(null);
    setFileList([]);
  }, []);

  const storeToken = useCallback((deviceUrl, newToken) => {
    saveToken(deviceUrl, newToken);
    setToken(newToken);
  }, []);

  const clearDevice = useCallback(() => {
    setSelectedDevice(null);
    setCurrentPath(undefined);
    setFileList([]);
    setToken(null);
  }, []);

  return (
    <DeviceContext.Provider
      value={{
        selectedDevice,
        selectDevice,
        clearDevice,
        currentPath,
        setCurrentPath,
        fileList,
        setFileList,
        token,
        storeToken,
        pairingDevice,
        setPairingDevice,
      }}
    >
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice() {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error("useDevice must be used inside DeviceProvider");
  return ctx;
}
