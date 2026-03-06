import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  DeviceEventEmitter,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useConnectionStore } from "../../../stores/connection";
import { usePlaybackStore, type StreamingVideo } from "../../../stores/playback";
import { useTVHistoryStore } from "../../../stores/tvHistory";
import { api } from "../../../services/api";
import { getVideoLocalPath } from "../../../services/downloader";
import {
  TVCard,
  TV_GRID_CARD_HEIGHT,
  TV_GRID_CARD_WIDTH,
} from "../../../components/tv/TVCard";
import { TVFocusPressable } from "../../../components/tv/TVFocusPressable";
import { useLibraryCatalog } from "../../../core/hooks/useLibraryCatalog";
import type { RemotePlaylist, RemoteVideoWithStatus } from "../../../types";

const GRID_COLUMNS = 4;
const GRID_ROWS = 2;
const PAGE_SIZE = GRID_COLUMNS * GRID_ROWS;

type DetailMode = "playlists" | "videos";

type BaseGridCard = {
  id: string;
  title: string;
  subtitle: string;
  thumbnailUrl?: string | null;
  type: "playlist" | "video";
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function toStreamingVideos(
  input: RemoteVideoWithStatus[],
  localPathByVideoId: Map<string, string>,
  serverUrl: string | null
) {
  return input.map<StreamingVideo>((item) => {
    const localPath = getVideoLocalPath(item.id) ?? localPathByVideoId.get(item.id);
    return {
      id: item.id,
      title: item.title,
      channelTitle: item.channelTitle,
      duration: item.duration,
      thumbnailUrl: resolveThumbnailUrl(serverUrl, item.thumbnailUrl) ?? undefined,
      localPath,
    };
  });
}

function resolveThumbnailUrl(
  serverUrl: string | null,
  thumbnailUrl?: string | null
): string | null {
  const trimmed = thumbnailUrl?.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (!serverUrl) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) {
    return `${serverUrl}${trimmed}`;
  }
  return `${serverUrl}/${trimmed}`;
}

export default function TVChannelDetailScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const serverUrl = useConnectionStore((state) => state.serverUrl);
  const startPlaylist = usePlaybackStore((state) => state.startPlaylist);
  const upsertRecentPlaylist = useTVHistoryStore(
    (state) => state.upsertRecentPlaylist
  );
  const { offlineVideos } = useLibraryCatalog();

  const [detailMode, setDetailMode] = useState<DetailMode>("playlists");
  const [channelPlaylists, setChannelPlaylists] = useState<RemotePlaylist[]>([]);
  const [channelVideos, setChannelVideos] = useState<RemoteVideoWithStatus[]>([]);
  const [pageOffset, setPageOffset] = useState(0);
  const [focusedGridIndex, setFocusedGridIndex] = useState(0);
  const [isGridFocused, setIsGridFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const localPathByVideoId = useMemo(() => {
    const map = new Map<string, string>();
    for (const video of offlineVideos) {
      const localPath = getVideoLocalPath(video.id);
      if (localPath) {
        map.set(video.id, localPath);
      }
    }
    return map;
  }, [offlineVideos]);

  const loadChannelData = useCallback(async () => {
    if (!id || !serverUrl) {
      setError("Not connected");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [{ playlists: allPlaylists }, { videos }] = await Promise.all([
        api.getPlaylists(serverUrl),
        api.getChannelVideos(serverUrl, id),
      ]);

      const playlistsOfChannel = allPlaylists.filter((item) => item.channelId === id);

      setChannelPlaylists(playlistsOfChannel);
      setChannelVideos(videos);
      setDetailMode(playlistsOfChannel.length > 0 ? "playlists" : "videos");
      setPageOffset(0);
      setFocusedGridIndex(0);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsLoading(false);
    }
  }, [id, serverUrl]);

  useEffect(() => {
    void loadChannelData();
  }, [loadChannelData]);

  const playPlaylist = useCallback(
    async (playlistId: string, playlistTitle: string) => {
      if (!serverUrl) return;

      const response = await api.getPlaylistVideos(serverUrl, playlistId);
      const streamingVideos = toStreamingVideos(response.videos, localPathByVideoId, serverUrl);
      if (streamingVideos.length === 0) return;

      const nextPlaylistId = `playlist-${playlistId}`;
      upsertRecentPlaylist({
        playlistId: nextPlaylistId,
        title: playlistTitle,
        videos: streamingVideos,
        startIndex: 0,
        serverUrl,
      });
      startPlaylist(nextPlaylistId, playlistTitle, streamingVideos, 0, serverUrl);
      router.push(`/(tv)/player/${streamingVideos[0].id}` as Href);
    },
    [localPathByVideoId, serverUrl, startPlaylist, upsertRecentPlaylist]
  );

  const playFromChannelVideos = useCallback(
    (videoId: string) => {
      if (!serverUrl) return;

      const streamingVideos = toStreamingVideos(channelVideos, localPathByVideoId, serverUrl);
      const startIndex = streamingVideos.findIndex((item) => item.id === videoId);
      if (startIndex < 0 || streamingVideos.length === 0) return;

      const nextPlaylistId = `channel-${id}`;
      upsertRecentPlaylist({
        playlistId: nextPlaylistId,
        title: title ?? "Channel",
        videos: streamingVideos,
        startIndex,
        serverUrl,
      });
      startPlaylist(
        nextPlaylistId,
        title ?? "Channel",
        streamingVideos,
        startIndex,
        serverUrl
      );
      router.push(`/(tv)/player/${videoId}` as Href);
    },
    [
      channelVideos,
      id,
      localPathByVideoId,
      serverUrl,
      startPlaylist,
      title,
      upsertRecentPlaylist,
    ]
  );

  const cards = useMemo<BaseGridCard[]>(() => {
    if (detailMode === "playlists") {
      return channelPlaylists.map((item) => ({
        id: item.playlistId,
        title: item.title,
        subtitle: `${item.downloadedCount} ready`,
        thumbnailUrl:
          resolveThumbnailUrl(serverUrl, item.thumbnailUrl) ??
          (serverUrl ? api.getPlaylistThumbnailUrl(serverUrl, item.playlistId) : null),
        type: "playlist",
      }));
    }

    return channelVideos.map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.channelTitle,
      thumbnailUrl:
        resolveThumbnailUrl(serverUrl, item.thumbnailUrl) ??
        (serverUrl ? api.getThumbnailUrl(serverUrl, item.id) : null),
      type: "video",
    }));
  }, [channelPlaylists, channelVideos, detailMode, serverUrl]);

  const maxOffset = Math.max(0, cards.length - PAGE_SIZE);
  const clampedOffset = Math.min(pageOffset, maxOffset);
  const pageItems = useMemo(
    () => cards.slice(clampedOffset, clampedOffset + PAGE_SIZE),
    [cards, clampedOffset]
  );

  useEffect(() => {
    if (pageOffset !== clampedOffset) {
      setPageOffset(clampedOffset);
    }
  }, [clampedOffset, pageOffset]);

  useEffect(() => {
    if (pageItems.length === 0) {
      if (focusedGridIndex !== 0) {
        setFocusedGridIndex(0);
      }
      return;
    }

    if (focusedGridIndex > pageItems.length - 1) {
      setFocusedGridIndex(pageItems.length - 1);
    }
  }, [focusedGridIndex, pageItems.length]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "onHWKeyEvent",
      (event: { eventType?: string; eventKeyAction?: number }) => {
        if (!isGridFocused) return;
        if (!pageItems.length) return;
        if (typeof event.eventKeyAction === "number" && event.eventKeyAction !== 0) {
          return;
        }

        if (event.eventType === "right" && focusedGridIndex === pageItems.length - 1) {
          const nextOffset = Math.min(clampedOffset + PAGE_SIZE, maxOffset);
          if (nextOffset !== clampedOffset) {
            setPageOffset(nextOffset);
            setFocusedGridIndex(0);
          }
        }

        if (event.eventType === "left" && focusedGridIndex === 0 && clampedOffset > 0) {
          const nextOffset = Math.max(0, clampedOffset - PAGE_SIZE);
          if (nextOffset !== clampedOffset) {
            setPageOffset(nextOffset);
            setFocusedGridIndex(PAGE_SIZE - 1);
          }
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, [clampedOffset, focusedGridIndex, isGridFocused, maxOffset, pageItems.length]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <TVFocusPressable
          style={styles.backButton}
          hasTVPreferredFocus
          onFocus={() => setIsGridFocused(false)}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TVFocusPressable>

        <TVFocusPressable
          style={styles.settingsButton}
          onFocus={() => setIsGridFocused(false)}
          onPress={() => router.push("/(tv)/settings" as Href)}
        >
          <Text style={styles.settingsButtonText}>Settings</Text>
        </TVFocusPressable>
      </View>

      {isLoading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#ffd93d" />
        </View>
      ) : null}

      {!isLoading && error ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Could not load channel</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TVFocusPressable style={styles.retryButton} onPress={() => void loadChannelData()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TVFocusPressable>
        </View>
      ) : null}

      {!isLoading && !error && cards.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No playlists or videos</Text>
        </View>
      ) : null}

      {!isLoading && !error && cards.length > 0 ? (
        <FlatList
          data={pageItems}
          key={`${detailMode}-${clampedOffset}`}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          numColumns={GRID_COLUMNS}
          scrollEnabled={false}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          renderItem={({ item, index }) => {
            return (
              <TVCard
                title={item.title}
                subtitle={item.subtitle}
                thumbnailUrl={item.thumbnailUrl}
                hasTVPreferredFocus={index === focusedGridIndex}
                onFocus={() => {
                  setIsGridFocused(true);
                  setFocusedGridIndex(index);
                }}
                onPress={() => {
                  if (item.type === "playlist") {
                    void playPlaylist(item.id, item.title);
                  } else {
                    playFromChannelVideos(item.id);
                  }
                }}
                style={styles.card}
              />
            );
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f1b3a",
    paddingHorizontal: 36,
    paddingBottom: 24,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  backButton: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#ffd93d",
    backgroundColor: "#ff8a00",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  backButtonText: {
    color: "#fffef2",
    fontSize: 20,
    fontWeight: "900",
  },
  settingsButton: {
    borderRadius: 16,
    backgroundColor: "#ff6b6b",
    borderColor: "#ffb86b",
    borderWidth: 2,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  settingsButtonText: {
    color: "#fffdf4",
    fontSize: 20,
    fontWeight: "800",
  },
  loaderWrap: {
    marginTop: 48,
    alignItems: "center",
  },
  emptyState: {
    marginTop: 24,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#8ec5ff",
    backgroundColor: "#2d7ff9",
    padding: 18,
    gap: 8,
  },
  emptyText: {
    color: "#fffef2",
    fontSize: 22,
    fontWeight: "800",
  },
  errorText: {
    color: "#ffe3e3",
    fontSize: 16,
    fontWeight: "700",
  },
  retryButton: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ffd93d",
    backgroundColor: "#ff6b6b",
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryButtonText: {
    color: "#fffef2",
    fontSize: 18,
    fontWeight: "900",
  },
  grid: {
    paddingBottom: 24,
    gap: 14,
  },
  row: {
    gap: 14,
    marginBottom: 14,
  },
  card: {
    width: TV_GRID_CARD_WIDTH,
    height: TV_GRID_CARD_HEIGHT,
  },
});
