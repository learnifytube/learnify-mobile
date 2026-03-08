import { Platform } from "react-native";

const ANDROID_EMULATOR_HOSTS = ["10.0.2.2", "10.0.3.2"];
const ANDROID_EMULATOR_PATTERNS = [
  "generic",
  "emulator",
  "sdk_",
  "emu64",
  "vbox",
];

type AndroidPlatformConstants = {
  Brand?: string;
  Fingerprint?: string;
  Manufacturer?: string;
  Model?: string;
};

function getAndroidPlatformHints(): string {
  if (Platform.OS !== "android") {
    return "";
  }

  const constants = Platform.constants as AndroidPlatformConstants | undefined;
  return [
    constants?.Brand,
    constants?.Fingerprint,
    constants?.Manufacturer,
    constants?.Model,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
}

export function isAndroidEmulator(): boolean {
  if (Platform.OS !== "android") {
    return false;
  }

  const hints = getAndroidPlatformHints();
  return ANDROID_EMULATOR_PATTERNS.some((pattern) => hints.includes(pattern));
}

export function getAndroidEmulatorHostConnectUrls(ports: number[]): string[] {
  if (!isAndroidEmulator()) {
    return [];
  }

  const normalizedPorts = Array.from(
    new Set(
      ports.filter(
        (port): port is number => Number.isInteger(port) && Number(port) > 0
      )
    )
  );

  const urls: string[] = [];
  for (const host of ANDROID_EMULATOR_HOSTS) {
    for (const port of normalizedPorts) {
      urls.push(`http://${host}:${port}`);
    }
  }

  return urls;
}
