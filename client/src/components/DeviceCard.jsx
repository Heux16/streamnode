import { useDevice } from "../context/DeviceContext.jsx";
import { useNavigate } from "react-router-dom";
import { loadToken, setBaseURL } from "../services/api.js";

const DEVICE_ICONS = {
  laptop: "💻",
  phone: "📱",
  tablet: "📱",
  desktop: "🖥",
  server: "🗄",
  default: "📡",
};

function deviceIcon(name = "") {
  const lower = name.toLowerCase();
  for (const key of Object.keys(DEVICE_ICONS)) {
    if (lower.includes(key)) return DEVICE_ICONS[key];
  }
  return DEVICE_ICONS.default;
}

export default function DeviceCard({ device }) {
  const { selectDevice, setPairingDevice } = useDevice();
  const navigate = useNavigate();

  function handleClick() {
    const existing = loadToken(device.url);
    if (existing) {
      // Already have a valid token — go straight to file explorer
      selectDevice(device, existing);
      navigate("/device");
    } else {
      // Need to pair first — set the base URL so pair requests reach this device
      setBaseURL(device.url);
      setPairingDevice(device);
    }
  }

  return (
    <button
      onClick={handleClick}
      className="w-full text-left bg-surface-card border border-surface-border rounded-2xl p-5
        hover:border-brand hover:bg-surface-hover transition-all duration-200 group"
    >
      <div className="flex items-center gap-3 mb-3">
        <span className="text-3xl">{deviceIcon(device.name)}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white truncate group-hover:text-brand-light transition-colors">
            {device.name}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {device.host}:{device.port}
          </p>
        </div>
        <span
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
            device.online ? "bg-green-400" : "bg-red-500"
          }`}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {device.online ? "Online" : "Offline"}
        </span>
        <span className="text-xs text-brand opacity-0 group-hover:opacity-100 transition-opacity">
          Open →
        </span>
      </div>
    </button>
  );
}
