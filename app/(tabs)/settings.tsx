import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  ScrollView,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSettingsStore, LANGUAGES } from "../../stores/settings";
import { useConnectionStore } from "../../stores/connection";
import { api } from "../../services/api";
import type { RemoteSavedWord } from "../../types";

export default function SettingsScreen() {
  const targetLang = useSettingsStore((s) => s.translationTargetLang);
  const setTargetLang = useSettingsStore((s) => s.setTranslationTargetLang);
  const serverUrl = useConnectionStore((s) => s.serverUrl);

  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showMyWords, setShowMyWords] = useState(false);
  const [savedWords, setSavedWords] = useState<RemoteSavedWord[]>([]);
  const [isLoadingWords, setIsLoadingWords] = useState(false);

  const selectedLang = LANGUAGES.find((l) => l.code === targetLang) ?? LANGUAGES[0];

  const loadSavedWords = useCallback(async () => {
    if (!serverUrl) return;
    setIsLoadingWords(true);
    try {
      const result = await api.getSavedWords(serverUrl);
      setSavedWords(result.words);
    } catch (e) {
      console.log("[Settings] Failed to load saved words:", e);
    } finally {
      setIsLoadingWords(false);
    }
  }, [serverUrl]);

  useEffect(() => {
    if (showMyWords && serverUrl) {
      loadSavedWords();
    }
  }, [showMyWords, serverUrl, loadSavedWords]);

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView style={styles.scrollView}>
        {/* Translation Settings */}
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

        {/* My Words */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Words</Text>

          <Pressable
            style={styles.settingRow}
            onPress={() => setShowMyWords(true)}
          >
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Saved Words</Text>
              <Text style={styles.settingDescription}>
                View words you've saved while watching videos
              </Text>
            </View>
            <View style={styles.settingValue}>
              <Text style={styles.chevron}>›</Text>
            </View>
          </Pressable>
        </View>

        {/* Connection */}
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
      </ScrollView>

      {/* Language Picker Modal */}
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

      {/* My Words Modal */}
      <Modal
        visible={showMyWords}
        animationType="slide"
        onRequestClose={() => setShowMyWords(false)}
      >
        <SafeAreaView style={styles.wordsModal}>
          <View style={styles.wordsHeader}>
            <Text style={styles.wordsTitle}>My Words</Text>
            <Pressable onPress={() => setShowMyWords(false)}>
              <Text style={styles.wordsClose}>Done</Text>
            </Pressable>
          </View>

          {isLoadingWords ? (
            <View style={styles.wordsCentered}>
              <ActivityIndicator size="large" color="#e94560" />
              <Text style={styles.wordsLoadingText}>Loading words...</Text>
            </View>
          ) : !serverUrl ? (
            <View style={styles.wordsCentered}>
              <Text style={styles.wordsEmptyIcon}>📡</Text>
              <Text style={styles.wordsEmptyText}>
                Connect to desktop to view saved words
              </Text>
            </View>
          ) : savedWords.length === 0 ? (
            <View style={styles.wordsCentered}>
              <Text style={styles.wordsEmptyIcon}>📚</Text>
              <Text style={styles.wordsEmptyText}>
                No saved words yet.{"\n"}Tap words in transcript to translate and save them.
              </Text>
            </View>
          ) : (
            <FlatList
              data={savedWords}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.wordsList}
              renderItem={({ item }) => (
                <View style={styles.wordCard}>
                  <View style={styles.wordMainRow}>
                    <Text style={styles.wordSource}>{item.sourceText}</Text>
                    <Text style={styles.wordArrow}>→</Text>
                    <Text style={styles.wordTranslated}>
                      {item.translatedText}
                    </Text>
                  </View>
                  <View style={styles.wordMetaRow}>
                    <Text style={styles.wordLang}>
                      {item.sourceLang} → {item.targetLang}
                    </Text>
                    {item.reviewCount > 0 && (
                      <Text style={styles.wordReviews}>
                        {item.reviewCount} reviews
                      </Text>
                    )}
                  </View>
                </View>
              )}
            />
          )}
        </SafeAreaView>
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
    marginTop: 24,
    marginHorizontal: 16,
  },
  sectionTitle: {
    color: "#e94560",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 4,
  },
  settingDescription: {
    color: "#666",
    fontSize: 13,
    lineHeight: 18,
  },
  settingValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  settingValueText: {
    color: "#e94560",
    fontSize: 15,
    fontWeight: "600",
  },
  chevron: {
    color: "#666",
    fontSize: 20,
    marginLeft: 4,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  // Language picker modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: "#16213e",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: "70%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#333",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
  },
  langList: {
    maxHeight: 400,
  },
  langItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 2,
  },
  langItemActive: {
    backgroundColor: "rgba(233, 69, 96, 0.1)",
  },
  langItemText: {
    color: "#a0a0a0",
    fontSize: 16,
    flex: 1,
  },
  langItemTextActive: {
    color: "#e94560",
    fontWeight: "600",
  },
  langCode: {
    color: "#555",
    fontSize: 13,
    marginRight: 12,
  },
  checkmark: {
    color: "#e94560",
    fontSize: 18,
    fontWeight: "bold",
  },

  // My Words modal
  wordsModal: {
    flex: 1,
    backgroundColor: "#0f0f23",
  },
  wordsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a2e",
  },
  wordsTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  wordsClose: {
    color: "#e94560",
    fontSize: 16,
    fontWeight: "600",
  },
  wordsCentered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  wordsLoadingText: {
    color: "#a0a0a0",
    fontSize: 14,
    marginTop: 16,
  },
  wordsEmptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  wordsEmptyText: {
    color: "#666",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  wordsList: {
    padding: 16,
  },
  wordCard: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  wordMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  wordSource: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    flex: 1,
  },
  wordArrow: {
    color: "#555",
    fontSize: 16,
  },
  wordTranslated: {
    color: "#e94560",
    fontSize: 18,
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },
  wordMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  wordLang: {
    color: "#555",
    fontSize: 12,
  },
  wordReviews: {
    color: "#555",
    fontSize: 12,
  },
});
