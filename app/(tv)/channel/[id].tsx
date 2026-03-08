import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  DeviceEventEmitter,
  FlatList,
  StyleSheet,
  Text,
  View,
  findNodeHandle,
  useWindowDimensions,
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
} from "../../../components/tv/TVCard";
import {
  TVFocusPressable,
  type TVFocusPressableHandle,
} from "../../../components/tv/TVFocusPressable";
import {
  TV_GRID_GAP,
  TV_GRID_SIDE_PADDING,
  clampGridFocusIndex,
  getTVGridCardHeight,
  getTVGridCardWidth,
  getTVGridColumns,
  getTVGridPageSize,
  isLeftEdgeGridIndex,
  isRightEdgeGridIndex,
} from "../../../components/tv/grid";
import { useLibraryCatalog } from "../../../core/hooks/useLibraryCatalog";
import type { RemotePlaylist, RemoteVideoWithStatus } from "../../../types";

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
  const { width: windowWidth } = useWindowDimensions();
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
  const [cardNodeHandles, setCardNodeHandles] = useState<Array<number | undefined>>(
    []
  );
  const cardRefs = useRef<Array<TVFocusPressableHandle | null>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const gridColumns = useMemo(() => getTVGridColumns(windowWidth), [windowWidth]);
  const pageSize = useMemo(() => getTVGridPageSize(gridColumns), [gridColumns]);
  const gridCardWidth = useMemo(
    () => getTVGridCardWidth(windowWidth, gridColumns),
    [gridColumns, windowWidth]
  );
  const gridCardHeight = useMemo(
    () => getTVGridCardHeight(gridCardWidth),
    [gridCardWidth]
  );
  const gridCardStyle = useMemo(
    () => ({ width: gridCardWidth, height: gridCardHeight }),
    [gridCardHeight, gridCardWidth]
  );

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

  const maxOffset = Math.max(0, cards.length - pageSize);
  const clampedOffset = Math.min(pageOffset, maxOffset);
  const pageItems = useMemo(
    () => cards.slice(clampedOffset, clampedOffset + pageSize),
    [cards, clampedOffset, pageSize]
  );

  useEffect(() => {
    setCardNodeHandles([]);
    cardRefs.current = [];
  }, [clampedOffset, detailMode, pageItems.length]);

  useEffect(() => {
    setCardNodeHandles(
      pageItems.map((_, index) => {
        const node = cardRefs.current[index];
        return node ? findNodeHandle(node) ?? undefined : undefined;
      })
    );
  }, [pageItems]);

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

        if (
          event.eventType === "right" &&
          isRightEdgeGridIndex(focusedGridIndex, gridColumns, pageItems.length)
        ) {
          const nextOffset = Math.min(clampedOffset + 1, maxOffset);
          if (nextOffset !== clampedOffset) {
            const nextGlobalIndex = Math.min(
              clampedOffset + focusedGridIndex + 1,
              cards.length - 1
            );
            const nextPageCount = Math.min(pageSize, cards.length - nextOffset);
            setPageOffset(nextOffset);
            setFocusedGridIndex(
              clampGridFocusIndex(nextGlobalIndex, nextOffset, nextPageCount)
            );
          }
        }

        if (
          event.eventType === "left" &&
          isLeftEdgeGridIndex(focusedGridIndex, gridColumns) &&
          clampedOffset > 0
        ) {
          const nextOffset = Math.max(0, clampedOffset - 1);
          if (nextOffset !== clampedOffset) {
            const nextGlobalIndex = Math.max(clampedOffset + focusedGridIndex - 1, 0);
            const nextPageCount = Math.min(pageSize, cards.length - nextOffset);
            setPageOffset(nextOffset);
            setFocusedGridIndex(
              clampGridFocusIndex(nextGlobalIndex, nextOffset, nextPageCount)
            );
          }
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, [
    cards.length,
    clampedOffset,
    focusedGridIndex,
    gridColumns,
    isGridFocused,
    maxOffset,
    pageItems.length,
    pageSize,
  ]);

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
          numColumns={gridColumns}
          scrollEnabled={false}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          renderItem={({ item, index }) => {
            const isLeftEdge = isLeftEdgeGridIndex(index, gridColumns);
            const isRightEdge = isRightEdgeGridIndex(
              index,
              gridColumns,
              pageItems.length
            );
            const rightTargetIndex = isRightEdge ? index : index + 1;
            const leftTargetIndex = isLeftEdge ? index : index - 1;
            const upTargetIndex = index >= gridColumns ? index - gridColumns : undefined;
            const downCandidateIndex = index + gridColumns;
            const downTargetIndex =
              downCandidateIndex < pageItems.length ? downCandidateIndex : index;

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
                pressableRef={(node) => {
                  cardRefs.current[index] = node;
                }}
                nextFocusLeft={cardNodeHandles[leftTargetIndex]}
                nextFocusRight={cardNodeHandles[rightTargetIndex]}
                nextFocusUp={
                  upTargetIndex === undefined
                    ? undefined
                    : cardNodeHandles[upTargetIndex]
                }
                nextFocusDown={cardNodeHandles[downTargetIndex]}
                style={gridCardStyle}
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
    paddingHorizontal: TV_GRID_SIDE_PADDING,
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
  },
  row: {
    justifyContent: "flex-start",
    gap: TV_GRID_GAP,
    marginBottom: TV_GRID_GAP,
  },
});
