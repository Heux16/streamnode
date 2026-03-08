import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DeviceProvider } from "./context/DeviceContext.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import FileExplorer from "./pages/FileExplorer.jsx";
import PlayerPage from "./pages/PlayerPage.jsx";
import VirtualFSPage from "./pages/VirtualFSPage.jsx";

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <DeviceProvider>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/device" element={<FileExplorer />} />
          <Route path="/player" element={<PlayerPage />} />
          <Route path="/virtual" element={<VirtualFSPage />} />
        </Routes>
      </DeviceProvider>
    </BrowserRouter>
  );
}
