import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
} from "react-native";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLibraryStore } from "../../stores/library";
import { useConnectionStore } from "../../stores/connection";
import { VideoGridCard } from "../../components/VideoGridCard";
import * as watchHistoryRepo from "../../db/repositories/watchHistory";
import type { WatchHistoryItem } from "../../db/repositories/watchHistory";
import { colors, spacing, fontSize, fontWeight, radius } from "../../theme";

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
      <SafeAreaView style={styles.container} edges={["top"]}>
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
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Watch History</Text>
        <Text style={styles.headerSubtitle}>
          {historyItems.length} video{historyItems.length !== 1 ? "s" : ""}
        </Text>
      </View>

      <FlatList
        data={historyItems}
        keyExtractor={(item) => item.videoId}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.gridContent}
        renderItem={({ item }) => {
          const resumePosition = Math.max(
            0,
            Math.min(item.lastPositionSeconds, item.duration)
          );
          const progressPercent =
            item.duration > 0 ? (resumePosition / item.duration) * 100 : 0;

          return (
            <View style={styles.gridItem}>
              <VideoGridCard
                video={{
                  id: item.videoId,
                  title: item.title,
                  channelTitle: item.channelTitle,
                  duration: item.duration,
                  thumbnailUrl: item.thumbnailUrl,
                }}
                onPress={() => handlePressVideo(item)}
              />
              {/* Watch progress bar overlaid at the bottom of the card */}
              <View style={styles.watchProgressTrack}>
                <View
                  style={[
                    styles.watchProgressFill,
                    { width: `${Math.min(progressPercent, 100)}%` },
                  ]}
                />
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.foreground,
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.bold,
  },
  headerSubtitle: {
    color: colors.mutedForeground,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  gridRow: {
    paddingHorizontal: spacing.sm,
  },
  gridContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  gridItem: {
    flex: 1,
    marginHorizontal: spacing.xs,
    marginBottom: spacing.md,
  },
  watchProgressTrack: {
    height: 3,
    backgroundColor: colors.muted,
    borderRadius: 1.5,
    overflow: "hidden",
    marginTop: -2,
    marginHorizontal: 2,
  },
  watchProgressFill: {
    height: "100%",
    backgroundColor: colors.success,
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
    color: colors.foreground,
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  emptyDescription: {
    color: colors.mutedForeground,
    fontSize: fontSize.base,
    textAlign: "center",
    lineHeight: 22,
  },
});
