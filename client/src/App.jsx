import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DeviceProvider } from "./context/DeviceContext.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import FileExplorer from "./pages/FileExplorer.jsx";
import PlayerPage from "./pages/PlayerPage.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <DeviceProvider>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/device" element={<FileExplorer />} />
          <Route path="/player" element={<PlayerPage />} />
        </Routes>
      </DeviceProvider>
    </BrowserRouter>
  );
}
