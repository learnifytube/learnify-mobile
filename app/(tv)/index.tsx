import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  DeviceEventEmitter,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  View,
  FlatList,
} from "react-native";
import { Settings, Wifi, WifiOff } from "lucide-react-native";
import { router, type Href } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useConnectionStore } from "../../stores/connection";
import { usePlaybackStore, type StreamingVideo } from "../../stores/playback";
import { useTVHistoryStore } from "../../stores/tvHistory";
import { api } from "../../services/api";
import { startScanning, stopScanning } from "../../services/p2p/discovery";
import { getAndroidEmulatorHostConnectUrls } from "../../services/android-emulator";
import {
  assertSyncCompatibility,
  SyncCompatibilityError,
} from "../../services/sync-compatibility";
import { getVideoLocalPath } from "../../services/downloader";
import { TVFocusPressable } from "../../components/tv/TVFocusPressable";
import {
  TVCard,
  TV_GRID_CARD_HEIGHT,
  TV_GRID_CARD_WIDTH,
} from "../../components/tv/TVCard";
import { useLibraryCatalog } from "../../core/hooks/useLibraryCatalog";
import type {
  DiscoveredPeer,
  RemoteChannel,
  RemoteMyList,
  RemotePlaylist,
  RemoteVideoWithStatus,
} from "../../types";

const DEFAULT_SYNC_PORT = 53318;
const LEGACY_SYNC_PORT = 8384;
const ANDROID_NEARBY_WIFI_DEVICES_PERMISSION =
  "android.permission.NEARBY_WIFI_DEVICES";
const MAX_AUTO_CONNECT_ATTEMPTS = 30;
const AUTO_CONNECT_RETRY_MS = 3000;
const GRID_COLUMNS = 4;
const GRID_ROWS = 2;
const PAGE_SIZE = GRID_COLUMNS * GRID_ROWS;

type TVBrowseMode = "playlists" | "mylists" | "channels" | "history";
type ConnectionStage = "connecting" | "connected" | "offline";

type BaseGridCard = {
  id: string;
  title: string;
  subtitle: string;
  thumbnailUrl?: string | null;
  type: "playlist" | "mylist" | "channel" | "history";
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}

function normalizeDiscoveredHost(host: string): string {
  const trimmed = host.trim().replace(/%.+$/, "");
  if (trimmed.includes(":") && !trimmed.startsWith("[")) {
    return `[${trimmed}]`;
  }
  return trimmed;
}

function hostPriority(host: string): number {
  const bare = host.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(bare)) return 0;
  if (bare.endsWith(".local")) return 1;
  if (bare.includes(":")) return 2;
  return 3;
}

function buildDiscoveredConnectUrls(device: DiscoveredPeer): string[] {
  const hosts = (
    device.hosts && device.hosts.length > 0 ? device.hosts : [device.host]
  )
    .map(normalizeDiscoveredHost)
    .filter((host) => host.length > 0)
    .sort((a, b) => hostPriority(a) - hostPriority(b));

  if (hosts.length === 0) return [];

  const ports = [device.port, DEFAULT_SYNC_PORT, LEGACY_SYNC_PORT].filter(
    (value, index, arr): value is number =>
      Number.isInteger(value) && value > 0 && arr.indexOf(value) === index
  );

  const urls: string[] = [];
  for (const host of hosts) {
    for (const port of ports) {
      urls.push(`http://${host}:${port}`);
    }
  }
  return Array.from(new Set(urls));
}

function getAndroidApiLevel(): number {
  if (Platform.OS !== "android") return 0;
  if (typeof Platform.Version === "number") return Platform.Version;
  const parsed = Number.parseInt(String(Platform.Version), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function ensureDiscoveryPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;

  const apiLevel = getAndroidApiLevel();
  if (apiLevel < 33) return true;

  const permission =
    ANDROID_NEARBY_WIFI_DEVICES_PERMISSION as Parameters<
      typeof PermissionsAndroid.check
    >[0];

  const alreadyGranted = await PermissionsAndroid.check(permission);
  if (alreadyGranted) return true;

  const result = await PermissionsAndroid.request(permission, {
    title: "Allow Nearby Devices",
    message:
      "LearnifyTube needs Nearby devices permission to discover your desktop app on local Wi-Fi.",
    buttonPositive: "Allow",
    buttonNegative: "Not now",
  });

  return result === PermissionsAndroid.RESULTS.GRANTED;
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

export default function TVHomeScreen() {
  const { offlineVideos } = useLibraryCatalog();
  const serverUrl = useConnectionStore((state) => state.serverUrl);
  const setServerUrl = useConnectionStore((state) => state.setServerUrl);
  const setServerName = useConnectionStore((state) => state.setServerName);
  const disconnect = useConnectionStore((state) => state.disconnect);
  const startPlaylist = usePlaybackStore((state) => state.startPlaylist);
  const recentPlaylists = useTVHistoryStore((state) => state.recentPlaylists);
  const upsertRecentPlaylist = useTVHistoryStore(
    (state) => state.upsertRecentPlaylist
  );

  const [mode, setMode] = useState<TVBrowseMode>("playlists");

  const [connectionStage, setConnectionStage] = useState<ConnectionStage>(
    serverUrl ? "connected" : "connecting"
  );
  const [autoConnectAttempt, setAutoConnectAttempt] = useState(0);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [playlists, setPlaylists] = useState<RemotePlaylist[]>([]);
  const [myLists, setMyLists] = useState<RemoteMyList[]>([]);
  const [channels, setChannels] = useState<RemoteChannel[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);

  const [pageOffsets, setPageOffsets] = useState<Record<TVBrowseMode, number>>({
    playlists: 0,
    mylists: 0,
    channels: 0,
    history: 0,
  });
  const [focusedGridIndex, setFocusedGridIndex] = useState(0);
  const [isGridFocused, setIsGridFocused] = useState(false);

  const [discoveredCount, setDiscoveredCount] = useState(0);
  const discoveredPeersRef = useRef<DiscoveredPeer[]>([]);
  const emulatorHostConnectUrls = useMemo(
    () => getAndroidEmulatorHostConnectUrls([DEFAULT_SYNC_PORT, LEGACY_SYNC_PORT]),
    []
  );

  const autoConnectRunIdRef = useRef(0);
  const autoConnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const clearAutoConnectTimer = useCallback(() => {
    if (autoConnectTimerRef.current) {
      clearTimeout(autoConnectTimerRef.current);
      autoConnectTimerRef.current = null;
    }
  }, []);

  const connectWithCandidates = useCallback(
    async (candidateUrls: string[], fallbackName: string): Promise<boolean> => {
      if (candidateUrls.length === 0) return false;

      let lastError: unknown = null;

      for (const baseUrl of candidateUrls) {
        try {
          const info = await api.getInfo(baseUrl);
          assertSyncCompatibility(info);

          setServerUrl(baseUrl);
          setServerName(info.name ?? fallbackName);
          setCatalogError(null);
          return true;
        } catch (error) {
          if (error instanceof SyncCompatibilityError) {
            setCatalogError(error.message);
            return false;
          }
          lastError = error;
        }
      }

      if (lastError) {
        setCatalogError(getErrorMessage(lastError));
      }

      return false;
    },
    [setServerName, setServerUrl]
  );

  const connectToPeer = useCallback(
    async (peer: DiscoveredPeer): Promise<boolean> => {
      const candidateUrls = buildDiscoveredConnectUrls(peer);
      return connectWithCandidates(candidateUrls, peer.name);
    },
    [connectWithCandidates]
  );

  const runAutoConnectAttempt = useCallback(
    async (runId: number, attemptIndex: number) => {
      if (autoConnectRunIdRef.current !== runId) return;

      if (attemptIndex >= MAX_AUTO_CONNECT_ATTEMPTS) {
        setConnectionStage("offline");
        return;
      }

      setConnectionStage("connecting");
      setAutoConnectAttempt(attemptIndex + 1);

      const peers = discoveredPeersRef.current;
      const targetPeer = peers[0];

      let connected = false;
      if (targetPeer) {
        connected = await connectToPeer(targetPeer);
      } else if (emulatorHostConnectUrls.length > 0) {
        connected = await connectWithCandidates(emulatorHostConnectUrls, "Desktop Host");
      }

      if (autoConnectRunIdRef.current !== runId) return;

      if (connected) {
        setConnectionStage("connected");
        return;
      }

      autoConnectTimerRef.current = setTimeout(() => {
        void runAutoConnectAttempt(runId, attemptIndex + 1);
      }, AUTO_CONNECT_RETRY_MS);
    },
    [connectToPeer, connectWithCandidates, emulatorHostConnectUrls]
  );

  const startAutoConnect = useCallback(
    (hardReset = true) => {
      autoConnectRunIdRef.current += 1;
      const runId = autoConnectRunIdRef.current;

      clearAutoConnectTimer();
      setAutoConnectAttempt(0);
      setConnectionStage("connecting");

      if (hardReset) {
        disconnect();
      }

      autoConnectTimerRef.current = setTimeout(() => {
        void runAutoConnectAttempt(runId, 0);
      }, AUTO_CONNECT_RETRY_MS);
    },
    [clearAutoConnectTimer, disconnect, runAutoConnectAttempt]
  );

  const loadRemoteCollections = useCallback(async () => {
    if (!serverUrl) {
      setPlaylists([]);
      setMyLists([]);
      setChannels([]);
      return;
    }

    setIsLoadingCatalog(true);

    try {
      const [playlistRes, myListRes, channelRes] = await Promise.all([
        api.getPlaylists(serverUrl),
        api.getMyLists(serverUrl),
        api.getChannels(serverUrl),
      ]);

      setPlaylists(playlistRes.playlists);
      setMyLists(myListRes.mylists);
      setChannels(channelRes.channels);
      setCatalogError(null);
      setConnectionStage("connected");
    } catch (error) {
      disconnect();
      setConnectionStage("offline");
      setCatalogError(getErrorMessage(error));
      startAutoConnect(false);
    } finally {
      setIsLoadingCatalog(false);
    }
  }, [disconnect, serverUrl, startAutoConnect]);

  useEffect(() => {
    let cancelled = false;

    const beginScan = async () => {
      const granted = await ensureDiscoveryPermissions();
      if (!granted || cancelled) return;

      startScanning({
        onPeerFound: (peer) => {
          if (cancelled) return;

          const nextPeers = (() => {
            const existing = discoveredPeersRef.current.find((item) => item.name === peer.name);
            if (existing) {
              return discoveredPeersRef.current.map((item) =>
                item.name === peer.name ? peer : item
              );
            }
            return [...discoveredPeersRef.current, peer];
          })().sort((a, b) => a.name.localeCompare(b.name));

          discoveredPeersRef.current = nextPeers;
          setDiscoveredCount(nextPeers.length);
        },
        onPeerLost: (name) => {
          if (cancelled) return;

          const nextPeers = discoveredPeersRef.current.filter((item) => item.name !== name);
          discoveredPeersRef.current = nextPeers;
          setDiscoveredCount(nextPeers.length);
        },
        onError: (error) => {
          if (cancelled) return;
          setCatalogError(getErrorMessage(error));
        },
      });
    };

    void beginScan();

    return () => {
      cancelled = true;
      clearAutoConnectTimer();
      stopScanning();
    };
  }, [clearAutoConnectTimer]);

  useEffect(() => {
    if (!serverUrl) {
      startAutoConnect(false);
      return;
    }

    setConnectionStage("connected");
    void loadRemoteCollections();
  }, [loadRemoteCollections, serverUrl, startAutoConnect]);

  const playRemoteCollection = useCallback(
    async (kind: "playlist" | "mylist", id: string, title: string) => {
      if (!serverUrl) {
        setConnectionStage("offline");
        return;
      }

      const response =
        kind === "playlist"
          ? await api.getPlaylistVideos(serverUrl, id)
          : await api.getMyListVideos(serverUrl, id);

      const streamingVideos = toStreamingVideos(response.videos, localPathByVideoId, serverUrl);
      if (streamingVideos.length === 0) {
        return;
      }

      const nextPlaylistId = `${kind}-${id}`;
      upsertRecentPlaylist({
        playlistId: nextPlaylistId,
        title,
        videos: streamingVideos,
        startIndex: 0,
        serverUrl,
      });
      startPlaylist(nextPlaylistId, title, streamingVideos, 0, serverUrl);
      router.push(`/(tv)/player/${streamingVideos[0].id}` as Href);
    },
    [localPathByVideoId, serverUrl, startPlaylist, upsertRecentPlaylist]
  );

  const playlistCards = useMemo<BaseGridCard[]>(
    () =>
      playlists.map((item) => ({
        id: item.playlistId,
        title: item.title,
        subtitle: `${item.downloadedCount} ready`,
        thumbnailUrl:
          resolveThumbnailUrl(serverUrl, item.thumbnailUrl) ??
          (serverUrl ? api.getPlaylistThumbnailUrl(serverUrl, item.playlistId) : null),
        type: "playlist",
      })),
    [playlists, serverUrl]
  );

  const myListCards = useMemo<BaseGridCard[]>(
    () =>
      myLists.map((item) => ({
        id: item.id,
        title: item.name,
        subtitle: `${item.itemCount} videos`,
        thumbnailUrl: resolveThumbnailUrl(serverUrl, item.thumbnailUrl),
        type: "mylist",
      })),
    [myLists, serverUrl]
  );

  const channelCards = useMemo<BaseGridCard[]>(
    () =>
      channels.map((item) => ({
        id: item.channelId,
        title: item.channelTitle,
        subtitle: `${item.videoCount} videos`,
        thumbnailUrl: resolveThumbnailUrl(serverUrl, item.thumbnailUrl),
        type: "channel",
      })),
    [channels, serverUrl]
  );

  const historyCards = useMemo<BaseGridCard[]>(
    () =>
      recentPlaylists.map((item) => {
        const total = item.videos.length;
        const currentPosition = total > 0 ? Math.min(item.lastIndex + 1, total) : 0;
        const currentVideo = item.videos[item.lastIndex];
        const historyServerUrl = item.serverUrl ?? serverUrl ?? null;
        const subtitle = currentVideo
          ? `Resume ${currentPosition}/${total} - ${currentVideo.title}`
          : `Resume ${currentPosition}/${total}`;

        return {
          id: item.playlistId,
          title: item.title,
          subtitle,
          thumbnailUrl:
            resolveThumbnailUrl(historyServerUrl, currentVideo?.thumbnailUrl) ??
            resolveThumbnailUrl(historyServerUrl, item.videos[0]?.thumbnailUrl),
          type: "history",
        };
      }),
    [recentPlaylists, serverUrl]
  );

  const activeCards = useMemo(() => {
    if (mode === "playlists") return playlistCards;
    if (mode === "mylists") return myListCards;
    if (mode === "history") return historyCards;
    return channelCards;
  }, [channelCards, historyCards, mode, myListCards, playlistCards]);

  const currentOffset = pageOffsets[mode];
  const maxOffset = Math.max(0, activeCards.length - PAGE_SIZE);
  const pageOffset = Math.min(currentOffset, maxOffset);

  const pageItems = useMemo(
    () => activeCards.slice(pageOffset, pageOffset + PAGE_SIZE),
    [activeCards, pageOffset]
  );

  useEffect(() => {
    if (currentOffset !== pageOffset) {
      setPageOffsets((prev) => ({
        ...prev,
        [mode]: pageOffset,
      }));
    }
  }, [currentOffset, mode, pageOffset]);

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
          const nextOffset = Math.min(pageOffset + PAGE_SIZE, maxOffset);
          if (nextOffset !== pageOffset) {
            setPageOffsets((prev) => ({
              ...prev,
              [mode]: nextOffset,
            }));
            setFocusedGridIndex(0);
          }
        }

        if (event.eventType === "left" && focusedGridIndex === 0 && pageOffset > 0) {
          const nextOffset = Math.max(0, pageOffset - PAGE_SIZE);
          if (nextOffset !== pageOffset) {
            setPageOffsets((prev) => ({
              ...prev,
              [mode]: nextOffset,
            }));
            setFocusedGridIndex(PAGE_SIZE - 1);
          }
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, [focusedGridIndex, isGridFocused, maxOffset, mode, pageItems.length, pageOffset]);

  const handleCardPress = useCallback(
    (card: BaseGridCard) => {
      if (card.type === "playlist") {
        void playRemoteCollection("playlist", card.id, card.title);
        return;
      }

      if (card.type === "mylist") {
        void playRemoteCollection("mylist", card.id, card.title);
        return;
      }

      if (card.type === "history") {
        const target = recentPlaylists.find((item) => item.playlistId === card.id);
        if (!target || target.videos.length === 0) return;

        const safeIndex = Math.max(0, Math.min(target.lastIndex, target.videos.length - 1));
        const safeVideo = target.videos[safeIndex];
        if (!safeVideo) return;

        upsertRecentPlaylist({
          playlistId: target.playlistId,
          title: target.title,
          videos: target.videos,
          startIndex: safeIndex,
          serverUrl: target.serverUrl,
        });
        startPlaylist(
          target.playlistId,
          target.title,
          target.videos,
          safeIndex,
          target.serverUrl ?? undefined
        );
        router.push(`/(tv)/player/${safeVideo.id}` as Href);
        return;
      }

      router.push({
        pathname: "/(tv)/channel/[id]",
        params: { id: card.id, title: card.title },
      } as Href);
    },
    [playRemoteCollection, recentPlaylists, startPlaylist, upsertRecentPlaylist]
  );

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.controlsRow}>
        <View style={styles.modeTabs}>
          <TVFocusPressable
            style={[styles.modeTab, mode === "playlists" && styles.modeTabActive]}
            onPress={() => setMode("playlists")}
            onFocus={() => setIsGridFocused(false)}
            hasTVPreferredFocus
          >
            <Text style={styles.modeTabText}>Playlists</Text>
          </TVFocusPressable>
          <TVFocusPressable
            style={[styles.modeTab, mode === "mylists" && styles.modeTabActive]}
            onPress={() => setMode("mylists")}
            onFocus={() => setIsGridFocused(false)}
          >
            <Text style={styles.modeTabText}>My Lists</Text>
          </TVFocusPressable>
          <TVFocusPressable
            style={[styles.modeTab, mode === "channels" && styles.modeTabActive]}
            onPress={() => setMode("channels")}
            onFocus={() => setIsGridFocused(false)}
          >
            <Text style={styles.modeTabText}>Channels</Text>
          </TVFocusPressable>
          <TVFocusPressable
            style={[styles.modeTab, mode === "history" && styles.modeTabActive]}
            onPress={() => setMode("history")}
            onFocus={() => setIsGridFocused(false)}
          >
            <Text style={styles.modeTabText}>History</Text>
          </TVFocusPressable>
        </View>

        <View style={styles.iconActions}>
          <TVFocusPressable
            style={[
              styles.iconButton,
              connectionStage === "offline" && styles.iconButtonOffline,
              connectionStage === "connecting" && styles.iconButtonConnecting,
            ]}
            onPress={() => startAutoConnect(true)}
            onFocus={() => setIsGridFocused(false)}
            disabled={connectionStage === "connecting"}
          >
            {connectionStage === "connecting" ? (
              <ActivityIndicator size="small" color="#fffef2" />
            ) : connectionStage === "offline" ? (
              <WifiOff size={24} color="#fffef2" />
            ) : (
              <Wifi size={24} color="#fffef2" />
            )}
          </TVFocusPressable>
          <TVFocusPressable
            style={styles.iconButton}
            onPress={() => router.push("/(tv)/settings" as Href)}
            onFocus={() => setIsGridFocused(false)}
          >
            <Settings size={24} color="#fffef2" />
          </TVFocusPressable>
        </View>
      </View>

      {isLoadingCatalog && activeCards.length === 0 ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#ffd93d" />
        </View>
      ) : null}

      {!isLoadingCatalog && activeCards.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            {connectionStage === "connecting"
              ? discoveredCount > 0
                ? `Searching nearby desktop... (${discoveredCount})`
                : emulatorHostConnectUrls.length > 0
                  ? "Searching nearby desktop... Trying emulator host..."
                  : "Searching nearby desktop... (0)"
              : "No data yet"}
          </Text>
          {catalogError ? <Text style={styles.errorText}>{catalogError}</Text> : null}
        </View>
      ) : (
        <FlatList
          data={pageItems}
          key={`${mode}-${pageOffset}`}
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
                hasTVPreferredFocus={
                  connectionStage === "connected" && index === focusedGridIndex
                }
                onFocus={() => {
                  setIsGridFocused(true);
                  setFocusedGridIndex(index);
                }}
                onPress={() => handleCardPress(item)}
                style={styles.card}
              />
            );
          }}
        />
      )}
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
  controlsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 18,
    marginBottom: 12,
  },
  modeTabs: {
    flexDirection: "row",
    gap: 10,
    flex: 1,
  },
  modeTab: {
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: "#8ec5ff",
    backgroundColor: "#2d7ff9",
  },
  modeTabActive: {
    borderColor: "#ffd93d",
    backgroundColor: "#40c4aa",
  },
  modeTabText: {
    color: "#fffef2",
    fontSize: 18,
    fontWeight: "800",
  },
  iconActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconButton: {
    width: 54,
    height: 54,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#ffb86b",
    backgroundColor: "#ff6b6b",
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonConnecting: {
    backgroundColor: "#2d7ff9",
    borderColor: "#8ec5ff",
  },
  iconButtonOffline: {
    backgroundColor: "#ef4444",
    borderColor: "#fecaca",
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
