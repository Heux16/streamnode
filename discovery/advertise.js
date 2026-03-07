import Bonjour from "bonjour";

const bonjour = Bonjour();

let service = null;

export function startAdvertise({
  name = "StreamNode",
  type = "streamnode",
  port = 8000,
  txt = {}
} = {}) {
  if (service) {
    return {
      advertising: true,
      alreadyRunning: true,
      name: service.name,
      type,
      port: service.port
    };
  }

  service = bonjour.publish({ name, type, port, txt });

  return {
    advertising: true,
    alreadyRunning: false,
    name,
    type,
    port
  };
}

export function stopAdvertise() {
  if (!service) {
    return {
      advertising: false,
      alreadyStopped: true
    };
  }

  service.stop();
  service = null;

  // Send DNS-SD goodbye packets so LAN peers immediately drop this entry.
  // Use a callback so the socket isn't torn down before goodbye packets fly.
  bonjour.unpublishAll(() => {
    // noop - just ensures the callback fires after goodbyes are sent
  });

  return {
    advertising: false,
    alreadyStopped: false
  };
}

export function advertiseStatus() {
  return {
    advertising: Boolean(service),
    name: service?.name ?? null,
    port: service?.port ?? null
  };
}

// graceful shutdown
process.on("SIGINT", () => {
  bonjour.unpublishAll(() => bonjour.destroy());
});