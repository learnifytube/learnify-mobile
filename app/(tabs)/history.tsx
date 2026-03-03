import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
} from "react-native";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLibraryStore } from "../../stores/library";
import { useConnectionStore } from "../../stores/connection";
import * as watchHistoryRepo from "../../db/repositories/watchHistory";
import type { WatchHistoryItem } from "../../db/repositories/watchHistory";

export default function HistoryScreen() {
  const videos = useLibraryStore((state) => state.videos);
  const isConnectedToDesktop = useConnectionStore((state) => !!state.serverUrl);
  const [historyItems, setHistoryItems] = useState<WatchHistoryItem[]>([]);

  const loadHistory = useCallback(() => {
    const items = watchHistoryRepo.getWatchHistory(200);
    setHistoryItems(items);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, videos.length]);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  const handlePressVideo = useCallback((item: WatchHistoryItem) => {
    const start = Math.max(0, Math.floor(item.lastPositionSeconds));
    router.push(`/player/${item.videoId}?start=${start}`);
  }, []);

  if (historyItems.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🕐</Text>
          <Text style={styles.emptyTitle}>No Watch History Yet</Text>
          <Text style={styles.emptyDescription}>
            Start watching a video and your progress will appear here
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Watch History</Text>
        <Text style={styles.headerSubtitle}>
          {historyItems.length} video{historyItems.length !== 1 ? "s" : ""}
        </Text>
      </View>

      <FlatList
        data={historyItems}
        keyExtractor={(item) => item.videoId}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const resumePosition = Math.max(
            0,
            Math.min(item.lastPositionSeconds, item.duration)
          );
          const progressPercent =
            item.duration > 0 ? (resumePosition / item.duration) * 100 : 0;
          const canPlay = !!item.localPath || isConnectedToDesktop;

          return (
            <Pressable
              style={[styles.row, !canPlay && styles.rowDisabled]}
              onPress={() => handlePressVideo(item)}
              disabled={!canPlay}
            >
              <View style={styles.thumbnailWrap}>
                {item.thumbnailUrl ? (
                  <Image
                    source={{ uri: item.thumbnailUrl }}
                    style={styles.thumbnail}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
                    <Text style={styles.thumbnailPlaceholderText}>▶</Text>
                  </View>
                )}
                <View style={styles.durationBadge}>
                  <Text style={styles.durationText}>{formatTime(item.duration)}</Text>
                </View>
              </View>

              <View style={styles.rowBody}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.channel} numberOfLines={1}>
                  {item.channelTitle}
                </Text>
                <Text style={styles.meta}>
                  Resume at {formatTime(resumePosition)} •{" "}
                  {formatRelativeTime(item.lastWatchedAt)}
                </Text>
                {!canPlay && (
                  <Text style={styles.unavailableText}>
                    Connect to desktop to continue this video
                  </Text>
                )}
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.max(0, Math.min(progressPercent, 100))}%` },
                    ]}
                  />
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return "just now";

  const elapsedMs = Math.max(0, Date.now() - timestamp);
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  if (elapsedMinutes < 1) return "just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays}d ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  headerTitle: {
    color: "#fafafa",
    fontSize: 22,
    fontWeight: "700",
  },
  headerSubtitle: {
    color: "#71717a",
    fontSize: 13,
    marginTop: 2,
  },
  listContent: {
    padding: 12,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    backgroundColor: "#18181b",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#27272a",
    overflow: "hidden",
  },
  rowDisabled: {
    opacity: 0.65,
  },
  thumbnailWrap: {
    width: 132,
    backgroundColor: "#27272a",
  },
  thumbnail: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#27272a",
  },
  thumbnailPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  thumbnailPlaceholderText: {
    color: "#a1a1aa",
    fontSize: 24,
    fontWeight: "600",
  },
  durationBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  durationText: {
    color: "#fafafa",
    fontSize: 11,
    fontWeight: "600",
  },
  rowBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
    gap: 4,
  },
  title: {
    color: "#fafafa",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
  },
  channel: {
    color: "#a1a1aa",
    fontSize: 12,
  },
  meta: {
    color: "#38bdf8",
    fontSize: 12,
    marginTop: 2,
  },
  unavailableText: {
    color: "#f87171",
    fontSize: 11,
  },
  progressTrack: {
    marginTop: 4,
    height: 4,
    backgroundColor: "#27272a",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#22c55e",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },
  emptyIcon: {
    fontSize: 62,
    marginBottom: 14,
  },
  emptyTitle: {
    color: "#fafafa",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyDescription: {
    color: "#a1a1aa",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
});
