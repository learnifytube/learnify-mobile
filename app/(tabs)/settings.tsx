import Constants from "expo-constants";
import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSettingsStore, LANGUAGES } from "../../stores/settings";
import { useConnectionStore } from "../../stores/connection";
import { api } from "../../services/api";
import { startScanning, stopScanning } from "../../services/p2p/discovery";
import {
  assertSyncCompatibility,
  SyncCompatibilityError,
} from "../../services/sync-compatibility";
import {
  checkForAndroidApkUpdate,
  getAndroidApkUpdateAvailability,
  type AndroidApkUpdateAvailability,
} from "../../services/app-update";
import type { DiscoveredPeer } from "../../types";

const DEFAULT_SYNC_PORT = 53318;
const LEGACY_SYNC_PORT = 8384;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function buildManualConnectUrls(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;

  try {
    const parsed = new URL(withScheme);
    const protocol = parsed.protocol === "https:" ? "https:" : "http:";

    if (parsed.port) {
      return [`${protocol}//${parsed.hostname}:${parsed.port}`];
    }

    return Array.from(
      new Set([
        `${protocol}//${parsed.hostname}:${DEFAULT_SYNC_PORT}`,
        `${protocol}//${parsed.hostname}:${LEGACY_SYNC_PORT}`,
      ])
    );
  } catch {
    if (trimmed.includes(":")) return [`http://${trimmed}`];
    return [
      `http://${trimmed}:${DEFAULT_SYNC_PORT}`,
      `http://${trimmed}:${LEGACY_SYNC_PORT}`,
    ];
  }
}

function normalizeDiscoveredHost(host: string): string {
  const trimmed = host.trim().replace(/%.+$/, "");
  if (trimmed.includes(":") && !trimmed.startsWith("[")) {
    return `[${trimmed}]`;
  }
  return trimmed;
}

function buildDiscoveredConnectUrls(device: DiscoveredPeer): string[] {
  const host = normalizeDiscoveredHost(device.host);
  if (!host) return [];

  const ports = [device.port, DEFAULT_SYNC_PORT, LEGACY_SYNC_PORT].filter(
    (value, index, arr): value is number =>
      Number.isInteger(value) && value > 0 && arr.indexOf(value) === index
  );

  return ports.map((port) => `http://${host}:${port}`);
}

export default function SettingsScreen() {
  const targetLang = useSettingsStore((s) => s.translationTargetLang);
  const setTargetLang = useSettingsStore((s) => s.setTranslationTargetLang);

  const serverUrl = useConnectionStore((s) => s.serverUrl);
  const serverName = useConnectionStore((s) => s.serverName);
  const { setServerUrl, setServerName } = useConnectionStore();
  const disconnect = useConnectionStore((s) => s.disconnect);
  const isConnected = !!serverUrl;

  const [showLangPicker, setShowLangPicker] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isLoadingUpdateAvailability, setIsLoadingUpdateAvailability] =
    useState(false);
  const [updateAvailability, setUpdateAvailability] =
    useState<AndroidApkUpdateAvailability | null>(null);

  // Connection state
  const [ipAddress, setIpAddress] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredPeer[]>(
    []
  );
  const [isScanning, setIsScanning] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);

  const selectedLang =
    LANGUAGES.find((l) => l.code === targetLang) ?? LANGUAGES[0];

  const appVersion =
    Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? "unknown";
  const appBuild = Constants.nativeBuildVersion ?? "-";

  // mDNS scanning when not connected
  useEffect(() => {
    if (isConnected) return;

    setIsScanning(true);
    startScanning({
      onPeerFound: (peer) => {
        setDiscoveredDevices((prev) => {
          const existing = prev.find((p) => p.name === peer.name);
          if (existing) return prev.map((p) => (p.name === peer.name ? peer : p));
          return [...prev, peer];
        });
      },
      onPeerLost: (name) => {
        setDiscoveredDevices((prev) => prev.filter((p) => p.name !== name));
      },
      onError: (error) => {
        console.error("[Settings] mDNS scan error:", error);
      },
    });

    return () => {
      stopScanning();
      setIsScanning(false);
    };
  }, [isConnected]);

  const refreshUpdateAvailability = useCallback(async () => {
    setIsLoadingUpdateAvailability(true);
    try {
      const availability = await getAndroidApkUpdateAvailability();
      setUpdateAvailability(availability);
    } finally {
      setIsLoadingUpdateAvailability(false);
    }
  }, []);

  useEffect(() => {
    void refreshUpdateAvailability();
  }, [refreshUpdateAvailability]);

  const handleUpdatePress = useCallback(async () => {
    if (isCheckingUpdate) return;
    setIsCheckingUpdate(true);
    try {
      await checkForAndroidApkUpdate({ manual: true });
    } finally {
      setIsCheckingUpdate(false);
      void refreshUpdateAvailability();
    }
  }, [isCheckingUpdate, refreshUpdateAvailability]);

  const showCompatibilityAlert = (error: SyncCompatibilityError): void => {
    if (error.issue === "desktop_update_required") {
      Alert.alert("Desktop Update Required", error.message);
      return;
    }
    Alert.alert("Mobile Update Required", error.message);
  };

  const handleConnectToDevice = async (device: DiscoveredPeer) => {
    const candidateUrls = buildDiscoveredConnectUrls(device);
    setIsConnecting(true);
    let lastError: unknown = null;

    try {
      for (const url of candidateUrls) {
        try {
          const info = await api.getInfo(url);
          assertSyncCompatibility(info);
          setServerUrl(url);
          setServerName(info.name);
          return;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return;
          if (error instanceof SyncCompatibilityError) throw error;
          lastError = error;
        }
      }
      throw lastError ?? new Error("All connection attempts failed");
    } catch (error) {
      if (error instanceof SyncCompatibilityError) {
        showCompatibilityAlert(error);
        return;
      }
      const reason = getErrorMessage(error);
      Alert.alert(
        "Connection Failed",
        `Could not connect to the device.\n\nLast error:\n${reason}\n\nTip: ensure Desktop app Sync is enabled and both devices are on the same Wi-Fi.`
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleManualConnect = async () => {
    if (!ipAddress.trim()) {
      Alert.alert("Error", "Please enter an IP address");
      return;
    }
    setIsConnecting(true);
    const candidateUrls = buildManualConnectUrls(ipAddress);
    let lastError: unknown = null;

    try {
      for (const url of candidateUrls) {
        try {
          const info = await api.getInfo(url);
          assertSyncCompatibility(info);
          setServerUrl(url);
          setServerName(info.name);
          setShowManualInput(false);
          setIpAddress("");
          return;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return;
          if (error instanceof SyncCompatibilityError) throw error;
          lastError = error;
        }
      }
      throw lastError ?? new Error("All connection attempts failed");
    } catch (error) {
      if (error instanceof SyncCompatibilityError) {
        showCompatibilityAlert(error);
        return;
      }
      const reason = getErrorMessage(error);
      Alert.alert(
        "Connection Failed",
        `Could not connect to desktop.\n\nTried:\n${candidateUrls.join("\n")}\n\nLast error:\n${reason}`
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      "Disconnect",
      `Disconnect from ${serverName || "Desktop"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: () => {
            disconnect();
            setDiscoveredDevices([]);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView style={styles.scrollView}>
        {/* Connection Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connection</Text>

          {isConnected ? (
            /* Connected state */
            <View style={styles.connectedCard}>
              <View style={styles.connectedHeader}>
                <View style={styles.connectedDot} />
                <View style={styles.connectedInfo}>
                  <Text style={styles.connectedName}>
                    {serverName || "Desktop"}
                  </Text>
                  <Text style={styles.connectedUrl}>{serverUrl}</Text>
                </View>
              </View>
              <Pressable
                style={styles.disconnectButton}
                onPress={handleDisconnect}
              >
                <Text style={styles.disconnectButtonText}>Disconnect</Text>
              </Pressable>
            </View>
          ) : (
            /* Disconnected state — show discovery + manual */
            <>
              {/* Discovered devices */}
              {discoveredDevices.length > 0 && (
                <View style={styles.discoveredSection}>
                  <View style={styles.discoveredHeader}>
                    <Text style={styles.discoveredLabel}>Nearby Devices</Text>
                    {isScanning && (
                      <ActivityIndicator color="#4ade80" size="small" />
                    )}
                  </View>
                  {discoveredDevices.map((device) => (
                    <Pressable
                      key={device.name}
                      style={styles.deviceItem}
                      onPress={() => handleConnectToDevice(device)}
                      disabled={isConnecting}
                    >
                      <View style={styles.deviceIcon}>
                        <Text style={styles.deviceIconText}>💻</Text>
                      </View>
                      <View style={styles.deviceInfo}>
                        <Text style={styles.deviceName}>{device.name}</Text>
                        <Text style={styles.deviceMeta}>
                          {device.videoCount} videos • {device.host}
                        </Text>
                      </View>
                      {isConnecting ? (
                        <ActivityIndicator color="#e94560" size="small" />
                      ) : (
                        <Text style={styles.connectArrow}>›</Text>
                      )}
                    </Pressable>
                  ))}
                </View>
              )}

              {/* No devices found — scanning indicator */}
              {discoveredDevices.length === 0 && isScanning && (
                <View style={styles.scanningRow}>
                  <ActivityIndicator color="#a0a0a0" size="small" />
                  <Text style={styles.scanningText}>
                    Scanning for nearby devices...
                  </Text>
                </View>
              )}

              {/* Manual connect toggle */}
              {!showManualInput ? (
                <Pressable
                  style={styles.manualConnectRow}
                  onPress={() => setShowManualInput(true)}
                >
                  <View style={styles.settingInfo}>
                    <Text style={styles.settingLabel}>Connect Manually</Text>
                    <Text style={styles.settingDescription}>
                      Enter IP address to connect
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ) : (
                <View style={styles.manualInputCard}>
                  <Text style={styles.manualInputLabel}>
                    Enter desktop IP address
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="192.168.1.100"
                    placeholderTextColor="#666"
                    value={ipAddress}
                    onChangeText={setIpAddress}
                    keyboardType="url"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <View style={styles.manualInputActions}>
                    <Pressable
                      style={styles.cancelButton}
                      onPress={() => {
                        setShowManualInput(false);
                        setIpAddress("");
                      }}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.connectButton,
                        isConnecting && styles.connectButtonDisabled,
                      ]}
                      onPress={handleManualConnect}
                      disabled={isConnecting}
                    >
                      {isConnecting ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.connectButtonText}>Connect</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        {/* Translation Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Translation</Text>
          <Pressable
            style={styles.settingRow}
            onPress={() => setShowLangPicker(true)}
          >
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Target Language</Text>
              <Text style={styles.settingDescription}>
                Words will be translated to this language
              </Text>
            </View>
            <View style={styles.settingValue}>
              <Text style={styles.settingValueText}>{selectedLang.name}</Text>
              <Text style={styles.chevron}>›</Text>
            </View>
          </Pressable>
        </View>

        {/* App Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App</Text>

          {isLoadingUpdateAvailability && (
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Checking updates</Text>
                <Text style={styles.settingDescription}>
                  Looking for the latest APK release
                </Text>
              </View>
              <ActivityIndicator size="small" color="#e94560" />
            </View>
          )}

          {updateAvailability?.hasUpdate && (
            <Pressable
              style={[
                styles.settingRow,
                isCheckingUpdate && styles.settingRowDisabled,
              ]}
              onPress={handleUpdatePress}
              disabled={isCheckingUpdate}
            >
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Update App</Text>
                <Text style={styles.settingDescription}>
                  {updateAvailability.latestVersionLabel
                    ? `New version ${updateAvailability.latestVersionLabel} is available`
                    : "A new app version is available"}
                </Text>
              </View>
              <View style={styles.settingValue}>
                <Text style={styles.settingValueText}>
                  {isCheckingUpdate ? "Opening..." : "Update now"}
                </Text>
                <Text style={styles.chevron}>›</Text>
              </View>
            </Pressable>
          )}

          {!isLoadingUpdateAvailability &&
            updateAvailability?.configured &&
            !updateAvailability.hasUpdate && (
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>App is up to date</Text>
                  <Text style={styles.settingDescription}>
                    You already have the latest release
                  </Text>
                </View>
              </View>
            )}
        </View>

        <View style={styles.appInfoFooter}>
          <Text style={styles.appInfoText}>LearnifyTube</Text>
          <Text style={styles.appInfoSubText}>
            Version {appVersion} (build {appBuild})
          </Text>
        </View>
      </ScrollView>

      {/* Language picker modal */}
      <Modal
        visible={showLangPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLangPicker(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowLangPicker(false)}
        >
          <View
            style={styles.modalContent}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select Target Language</Text>

            <FlatList
              data={LANGUAGES}
              keyExtractor={(item) => item.code}
              style={styles.langList}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.langItem,
                    item.code === targetLang && styles.langItemActive,
                  ]}
                  onPress={() => {
                    setTargetLang(item.code);
                    setShowLangPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.langItemText,
                      item.code === targetLang && styles.langItemTextActive,
                    ]}
                  >
                    {item.name}
                  </Text>
                  <Text style={styles.langCode}>{item.code}</Text>
                  {item.code === targetLang && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f23",
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: "#8b9dc3",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    paddingHorizontal: 16,
  },

  /* Connected card */
  connectedCard: {
    backgroundColor: "#1a2e1a",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#2d4a2d",
  },
  connectedHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  connectedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#4ade80",
    marginRight: 10,
  },
  connectedInfo: {
    flex: 1,
  },
  connectedName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  connectedUrl: {
    color: "#a0a0a0",
    fontSize: 12,
    marginTop: 2,
  },
  disconnectButton: {
    backgroundColor: "#3f1515",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#5f2525",
  },
  disconnectButtonText: {
    color: "#f87171",
    fontSize: 14,
    fontWeight: "600",
  },

  /* Discovery */
  discoveredSection: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  discoveredHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  discoveredLabel: {
    color: "#4ade80",
    fontSize: 13,
    fontWeight: "600",
  },
  deviceItem: {
    flexDirection: "row",
    backgroundColor: "#1a2e1a",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2d4a2d",
  },
  deviceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2d4a2d",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  deviceIconText: {
    fontSize: 20,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "500",
    marginBottom: 2,
  },
  deviceMeta: {
    color: "#a0a0a0",
    fontSize: 12,
  },
  connectArrow: {
    color: "#4ade80",
    fontSize: 24,
    fontWeight: "300",
  },

  /* Scanning */
  scanningRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
    marginHorizontal: 16,
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    marginBottom: 8,
  },
  scanningText: {
    color: "#a0a0a0",
    fontSize: 13,
  },

  /* Manual connect */
  manualConnectRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  manualInputCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  manualInputLabel: {
    color: "#a0a0a0",
    fontSize: 13,
    marginBottom: 10,
  },
  input: {
    backgroundColor: "#0f0f23",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: "#fff",
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#2d2d44",
    marginBottom: 12,
  },
  manualInputActions: {
    flexDirection: "row",
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#242c3d",
  },
  cancelButtonText: {
    color: "#a0a0a0",
    fontSize: 14,
    fontWeight: "600",
  },
  connectButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#e94560",
  },
  connectButtonDisabled: {
    opacity: 0.6,
  },
  connectButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },

  /* General settings */
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  settingRowDisabled: {
    opacity: 0.6,
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 2,
  },
  settingDescription: {
    color: "#a0a0a0",
    fontSize: 13,
    lineHeight: 18,
  },
  settingValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  settingValueText: {
    color: "#e94560",
    fontSize: 15,
    fontWeight: "500",
  },
  chevron: {
    color: "#666",
    fontSize: 20,
    fontWeight: "300",
  },

  /* Footer */
  appInfoFooter: {
    marginTop: 8,
    marginBottom: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  appInfoText: {
    color: "#8b9dc3",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 2,
  },
  appInfoSubText: {
    color: "#6b7280",
    fontSize: 12,
  },

  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1a1a2e",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
    paddingHorizontal: 16,
    paddingBottom: 34,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#666",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 16,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
  },
  langList: {
    flexGrow: 0,
  },
  langItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f0f23",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  langItemActive: {
    backgroundColor: "#e94560",
  },
  langItemText: {
    color: "#fff",
    fontSize: 16,
    flex: 1,
  },
  langItemTextActive: {
    fontWeight: "600",
  },
  langCode: {
    color: "#a0a0a0",
    fontSize: 13,
    marginRight: 8,
    textTransform: "uppercase",
  },
  checkmark: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
});
