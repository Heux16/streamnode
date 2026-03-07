import Bonjour from "bonjour";

const bonjour = Bonjour();
const browser = bonjour.find({ type: "streamnode" });

const devices = [];

browser.on("up", (service) => {
  devices.push(service);
});

browser.on("down", (service) => {
  const i = devices.findIndex((d) => d.fqdn === service.fqdn);
  if (i !== -1) devices.splice(i, 1);
});

export default function find() {
  return { devices };
}