import Zeroconf from "react-native-zeroconf";
import Constants from "expo-constants";
import type { DiscoveredPeer } from "../../types";

const SERVICE_TYPE = "learnify";
const zeroconf = new Zeroconf();

let isInitialized = false;

const log = (message: string, data?: unknown) => {
  const timestamp = new Date().toISOString().split("T")[1].slice(0, 12);
  if (data) {
    console.log(`[${timestamp}] [mDNS] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${timestamp}] [mDNS] ${message}`);
  }
};

function ensureInitialized() {
  if (!isInitialized) {
    log("Initializing Zeroconf");
    zeroconf.scan(SERVICE_TYPE, "tcp", "local.");
    zeroconf.stop();
    isInitialized = true;
    log("Zeroconf initialized");
  }
}

function getTxtStringValue(txt: unknown, key: string): string | undefined {
  if (!txt || typeof txt !== "object") {
    return undefined;
  }
  const value = Reflect.get(txt, key);
  return typeof value === "string" ? value : undefined;
}

export function getDeviceName(): string {
  const name = Constants.deviceName || "LearnifyTube Device";
  log("Device name:", name);
  return name;
}

export function publishService(
  port: number,
  videoCount: number,
  onError?: (error: Error) => void
) {
  ensureInitialized();

  const name = getDeviceName();
  log(`Publishing service: ${name} on port ${port} with ${videoCount} videos`);

  try {
    zeroconf.publishService(SERVICE_TYPE, "tcp", "local.", name, port, {
      videoCount: String(videoCount),
      platform: "mobile",
    });
    log("Service published successfully");
  } catch (error) {
    log("Failed to publish service", error);
    onError?.(error as Error);
  }
}

// Publish presence without running a server (just for discovery by desktop)
export function publishPresence(onError?: (error: Error) => void) {
  ensureInitialized();

  const name = getDeviceName();
  log(`Publishing presence: ${name}`);

  try {
    // Use port 0 to indicate we're not running a server, just advertising presence
    zeroconf.publishService(SERVICE_TYPE, "tcp", "local.", name, 53319, {
      videoCount: "0",
      platform: "mobile",
    });
    log("Presence published successfully");
  } catch (error) {
    log("Failed to publish presence", error);
    onError?.(error as Error);
  }
}

export function unpublishService() {
  log("Unpublishing service");
  try {
    zeroconf.unpublishService(getDeviceName());
    log("Service unpublished");
  } catch (error) {
    log("Error unpublishing service (ignored)", error);
  }
}

export function startScanning(callbacks: {
  onPeerFound: (peer: DiscoveredPeer) => void;
  onPeerLost: (name: string) => void;
  onError?: (error: Error) => void;
}) {
  ensureInitialized();
  log(`Starting scan for _${SERVICE_TYPE}._tcp services`);

  zeroconf.on("resolved", (service) => {
    const platform =
      getTxtStringValue(service?.txt, "platform")?.toLowerCase() ?? undefined;
    log("Service resolved:", {
      name: service.name,
      host: service.host,
      addresses: service.addresses,
      port: service.port,
      platform,
      txt: service.txt,
    });

    if (service.name === getDeviceName()) {
      log("Ignoring self");
      return;
    }

    // Only show desktop peers for sync connections.
    if (platform && platform !== "desktop") {
      log("Ignoring non-desktop service", { name: service.name, platform });
      return;
    }

    if (!service.port || service.port <= 0) {
      log("Ignoring service with invalid port", {
        name: service.name,
        port: service.port,
      });
      return;
    }

    // Prefer IPv4 address from addresses array, fallback to host
    let host = service.host;
    if (service.addresses && service.addresses.length > 0) {
      // Find IPv4 address (not IPv6)
      const ipv4 = service.addresses.find(
        (addr: string) => addr.includes(".") && !addr.includes(":")
      );
      host = ipv4 || service.addresses[0];
    }
    if (typeof host !== "string" || host.trim().length === 0) {
      log("Ignoring service with missing host", { name: service.name });
      return;
    }

    // Remove interface suffix from IPv6 host strings (e.g. fe80::1%en0).
    host = host.trim().replace(/%.+$/, "");

    const peer: DiscoveredPeer = {
      name: service.name,
      host: host,
      port: service.port,
      videoCount: parseInt(service.txt?.videoCount || "0", 10),
    };
    log("Peer found:", peer);
    callbacks.onPeerFound(peer);
  });

  zeroconf.on("remove", (name) => {
    log("Service removed:", name);
    callbacks.onPeerLost(name);
  });

  zeroconf.on("error", (error) => {
    log("Scan error:", error);
    callbacks.onError?.(error);
  });

  zeroconf.scan(SERVICE_TYPE, "tcp", "local.");
  log("Scan started");
}

export function stopScanning() {
  log("Stopping scan");
  zeroconf.stop();
  zeroconf.removeAllListeners("resolved");
  zeroconf.removeAllListeners("remove");
  zeroconf.removeAllListeners("error");
  log("Scan stopped");
}

export function cleanup() {
  unpublishService();
  stopScanning();
}
