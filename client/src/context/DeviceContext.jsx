import { createContext, useContext, useState, useCallback } from "react";
import { setBaseURL } from "../services/api.js";

const DeviceContext = createContext(null);

export function DeviceProvider({ children }) {
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [currentPath, setCurrentPath] = useState("./shared");
  const [fileList, setFileList] = useState([]);

  const selectDevice = useCallback((device) => {
    setSelectedDevice(device);
    setBaseURL(device.url);
    setCurrentPath("./shared");
    setFileList([]);
  }, []);

  const clearDevice = useCallback(() => {
    setSelectedDevice(null);
    setCurrentPath("./shared");
    setFileList([]);
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
