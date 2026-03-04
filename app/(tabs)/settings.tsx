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
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSettingsStore, LANGUAGES } from "../../stores/settings";
import { useConnectionStore } from "../../stores/connection";
import {
  checkForAndroidApkUpdate,
  getAndroidApkUpdateAvailability,
  type AndroidApkUpdateAvailability,
} from "../../services/app-update";

export default function SettingsScreen() {
  const targetLang = useSettingsStore((s) => s.translationTargetLang);
  const setTargetLang = useSettingsStore((s) => s.setTranslationTargetLang);
  const serverUrl = useConnectionStore((s) => s.serverUrl);

  const [showLangPicker, setShowLangPicker] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isLoadingUpdateAvailability, setIsLoadingUpdateAvailability] =
    useState(false);
  const [updateAvailability, setUpdateAvailability] =
    useState<AndroidApkUpdateAvailability | null>(null);

  const selectedLang = LANGUAGES.find((l) => l.code === targetLang) ?? LANGUAGES[0];

  const appVersion =
    Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? "unknown";
  const appBuild = Constants.nativeBuildVersion ?? "-";

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
    if (isCheckingUpdate) {
      return;
    }

    setIsCheckingUpdate(true);
    try {
      await checkForAndroidApkUpdate({ manual: true });
    } finally {
      setIsCheckingUpdate(false);
      void refreshUpdateAvailability();
    }
  }, [isCheckingUpdate, refreshUpdateAvailability]);

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView style={styles.scrollView}>
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connection</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Desktop Server</Text>
              <Text style={styles.settingDescription}>
                {serverUrl ?? "Not connected"}
              </Text>
            </View>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: serverUrl ? "#059669" : "#666" },
              ]}
            />
          </View>
        </View>

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
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
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
