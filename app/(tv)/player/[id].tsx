import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DeviceEventEmitter, View, Text, StyleSheet } from "react-native";
import { useLocalSearchParams, router, type Href } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLibraryStore } from "../../../stores/library";
import { useConnectionStore } from "../../../stores/connection";
import { usePlaybackStore } from "../../../stores/playback";
import { useTVHistoryStore } from "../../../stores/tvHistory";
import { api } from "../../../services/api";
import { getVideoLocalPath } from "../../../services/downloader";
import { TVFocusPressable } from "../../../components/tv/TVFocusPressable";
import type { ServerDownloadStatus } from "../../../types";

type PrefetchState = "idle" | "loading" | "ready" | "failed";
type SourcePrepareState = "idle" | "preparing" | "ready" | "failed";

const SERVER_DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const SERVER_DOWNLOAD_POLL_MS = 2000;
const REMOTE_NAV_TIMEOUT_MS = 4500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    throw abortError;
  }
}

async function probeVideoFileAvailability(
  serverUrl: string,
  videoId: string,
  signal?: AbortSignal
): Promise<boolean> {
  const fileUrl = api.getVideoFileUrl(serverUrl, videoId);

  try {
    const head = await fetch(fileUrl, {
      method: "HEAD",
      signal,
    });
    if (head.ok) {
      return true;
    }
  } catch {
    // Continue to range probe
  }

  try {
    const probe = await fetch(fileUrl, {
      signal,
      headers: {
        Range: "bytes=0-2048",
      },
    });

    if (!probe.ok) {
      return false;
    }

    await probe.arrayBuffer();
    return true;
  } catch {
    return false;
  }
}

async function ensureServerVideoReady(
  serverUrl: string,
  videoId: string,
  options?: {
    signal?: AbortSignal;
    timeoutMs?: number;
    onStatus?: (status: ServerDownloadStatus) => void;
  }
): Promise<void> {
  const signal = options?.signal;
  const timeoutMs = options?.timeoutMs ?? SERVER_DOWNLOAD_TIMEOUT_MS;
  const onStatus = options?.onStatus;

  throwIfAborted(signal);

  const alreadyReady = await probeVideoFileAvailability(serverUrl, videoId, signal);
  if (alreadyReady) {
    onStatus?.({
      videoId,
      status: "completed",
      progress: 100,
      error: null,
    });
    return;
  }

  const response = await api.requestServerDownload(serverUrl, { videoId });
  if (!response.success && !response.status) {
    throw new Error(response.message || "Server refused download request");
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    throwIfAborted(signal);

    const status = await api.getServerDownloadStatus(serverUrl, videoId);
    onStatus?.(status);

    if (status.status === "failed") {
      throw new Error(status.error || "Server download failed");
    }

    if (status.status === "completed") {
      const ready = await probeVideoFileAvailability(serverUrl, videoId, signal);
      if (ready) {
        return;
      }
    }

    await sleep(SERVER_DOWNLOAD_POLL_MS);
  }

  throw new Error("Server download timed out");
}

export default function TVPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const libraryVideo = useLibraryStore((state) => state.videos.find((item) => item.id === id));
  const serverUrl = useConnectionStore((state) => state.serverUrl);

  const playlistId = usePlaybackStore((state) => state.playlistId);
  const playlistVideos = usePlaybackStore((state) => state.playlistVideos);
  const currentIndex = usePlaybackStore((state) => state.currentIndex);
  const setCurrentIndex = usePlaybackStore((state) => state.setCurrentIndex);
  const streamServerUrl = usePlaybackStore((state) => state.streamServerUrl);
  const updateRecentPlaylistProgress = useTVHistoryStore(
    (state) => state.updateRecentPlaylistProgress
  );

  const [prefetchState, setPrefetchState] = useState<PrefetchState>("idle");
  const [prepareState, setPrepareState] = useState<SourcePrepareState>("idle");
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [prepareProgress, setPrepareProgress] = useState<number | null>(null);
  const [prepareRetryVersion, setPrepareRetryVersion] = useState(0);
  const [isRemoteNavVisible, setIsRemoteNavVisible] = useState(true);
  const navigationLockVideoIdRef = useRef<string | null>(null);
  const prefetchedNextVideoIdRef = useRef<string | null>(null);
  const remoteNavTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRemoteNavTimeout = useCallback(() => {
    if (remoteNavTimeoutRef.current) {
      clearTimeout(remoteNavTimeoutRef.current);
      remoteNavTimeoutRef.current = null;
    }
  }, []);

  const showRemoteNav = useCallback(() => {
    setIsRemoteNavVisible(true);
    clearRemoteNavTimeout();
    remoteNavTimeoutRef.current = setTimeout(() => {
      setIsRemoteNavVisible(false);
      remoteNavTimeoutRef.current = null;
    }, REMOTE_NAV_TIMEOUT_MS);
  }, [clearRemoteNavTimeout]);

  const playlistIndex = useMemo(() => {
    if (!id) return -1;
    return playlistVideos.findIndex((item) => item.id === id);
  }, [id, playlistVideos]);

  const playlistVideo = playlistIndex >= 0 ? playlistVideos[playlistIndex] : undefined;
  const video = playlistVideo ?? libraryVideo;

  const effectiveServerUrl = streamServerUrl ?? serverUrl;

  const localPath = useMemo(() => {
    if (!id) return null;
    return playlistVideo?.localPath ?? getVideoLocalPath(id) ?? libraryVideo?.localPath ?? null;
  }, [id, playlistVideo?.localPath, libraryVideo?.localPath]);

  useEffect(() => {
    if (!id) {
      setPrepareState("failed");
      setPrepareError("Video ID is missing");
      setPrepareProgress(null);
      return;
    }

    if (localPath) {
      setPrepareState("ready");
      setPrepareError(null);
      setPrepareProgress(100);
      return;
    }

    if (!effectiveServerUrl) {
      setPrepareState("failed");
      setPrepareError("Video is not available offline");
      setPrepareProgress(null);
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();

    setPrepareState("preparing");
    setPrepareError(null);
    setPrepareProgress(null);

    const prepare = async () => {
      try {
        await ensureServerVideoReady(effectiveServerUrl, id, {
          signal: abortController.signal,
          onStatus: (status) => {
            if (cancelled) return;
            setPrepareProgress(status.progress ?? null);
          },
        });

        if (!cancelled) {
          setPrepareState("ready");
          setPrepareError(null);
          setPrepareProgress(100);
        }
      } catch (error) {
        if (cancelled || abortController.signal.aborted) {
          return;
        }

        setPrepareState("failed");
        setPrepareError(getErrorMessage(error));
        setPrepareProgress(null);
      }
    };

    void prepare();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [id, localPath, effectiveServerUrl, prepareRetryVersion]);

  const source = useMemo(() => {
    if (!id) return "";
    if (localPath) return localPath;
    if (!effectiveServerUrl) return "";
    if (prepareState !== "ready") return "";
    return api.getVideoFileUrl(effectiveServerUrl, id);
  }, [effectiveServerUrl, id, localPath, prepareState]);

  const player = useVideoPlayer(source, (instance) => {
    instance.loop = false;
    instance.play();
  });

  useEffect(() => {
    if (playlistIndex >= 0 && playlistIndex !== currentIndex) {
      setCurrentIndex(playlistIndex);
    }
  }, [playlistIndex, currentIndex, setCurrentIndex]);

  useEffect(() => {
    if (!playlistId || playlistIndex < 0) return;
    updateRecentPlaylistProgress({
      playlistId,
      currentIndex: playlistIndex,
      currentVideoId: playlistVideos[playlistIndex]?.id ?? null,
    });
  }, [
    playlistId,
    playlistIndex,
    playlistVideos,
    updateRecentPlaylistProgress,
  ]);

  const hasPlaylistContext = playlistIndex >= 0;
  const hasPrevious = hasPlaylistContext && playlistIndex > 0;
  const hasNext = hasPlaylistContext && playlistIndex < playlistVideos.length - 1;
  const nextVideo = hasNext ? playlistVideos[playlistIndex + 1] : null;
  const playbackModeLabel = localPath ? "Offline" : "Streaming";

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "onHWKeyEvent",
      (event: { eventType?: string; eventKeyAction?: number }) => {
        const eventType = event?.eventType;
        if (!eventType || eventType === "focus" || eventType === "blur") {
          return;
        }
        // Android sends ACTION_DOWN = 0 and ACTION_UP = 1. Show overlay only once per key press.
        if (typeof event.eventKeyAction === "number" && event.eventKeyAction !== 0) {
          return;
        }
        showRemoteNav();
      }
    );

    return () => {
      subscription.remove();
    };
  }, [showRemoteNav]);

  useEffect(() => {
    showRemoteNav();
    return () => {
      clearRemoteNavTimeout();
    };
  }, [clearRemoteNavTimeout, showRemoteNav]);

  const goToIndex = useCallback(
    (targetIndex: number) => {
      const target = playlistVideos[targetIndex];
      if (!target) return;
      navigationLockVideoIdRef.current = id ?? null;
      setCurrentIndex(targetIndex);
      router.replace(`/(tv)/player/${target.id}` as Href);
    },
    [id, playlistVideos, setCurrentIndex]
  );

  useEffect(() => {
    if (!player) return;

    const endSubscription = player.addListener("playToEnd", () => {
      if (id && navigationLockVideoIdRef.current === id) {
        return;
      }
      if (hasNext) {
        goToIndex(playlistIndex + 1);
      }
    });

    return () => {
      endSubscription.remove();
    };
  }, [player, hasNext, goToIndex, playlistIndex]);

  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();

    const warmNextVideo = async () => {
      if (!nextVideo) {
        prefetchedNextVideoIdRef.current = null;
        setPrefetchState("idle");
        return;
      }

      const nextLocalPath = nextVideo.localPath ?? getVideoLocalPath(nextVideo.id);
      if (nextLocalPath) {
        prefetchedNextVideoIdRef.current = nextVideo.id;
        setPrefetchState("ready");
        return;
      }

      if (!effectiveServerUrl) {
        setPrefetchState("idle");
        return;
      }

      if (prefetchedNextVideoIdRef.current === nextVideo.id) {
        setPrefetchState("ready");
        return;
      }

      setPrefetchState("loading");

      try {
        await ensureServerVideoReady(effectiveServerUrl, nextVideo.id, {
          signal: abortController.signal,
        });

        if (!cancelled) {
          prefetchedNextVideoIdRef.current = nextVideo.id;
          setPrefetchState("ready");
        }
      } catch (error) {
        if (!cancelled && !abortController.signal.aborted) {
          console.log("[TV Player] Next video prefetch failed:", error);
          prefetchedNextVideoIdRef.current = null;
          setPrefetchState("failed");
        }
      }
    };

    void warmNextVideo();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [effectiveServerUrl, nextVideo?.id, nextVideo?.localPath]);

  if (!id || !source) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <TVFocusPressable onPress={() => router.back()} style={styles.backButton} hasTVPreferredFocus>
          <Text style={styles.backButtonText}>Back</Text>
        </TVFocusPressable>
        <View style={styles.centered}>
          {prepareState === "preparing" ? (
            <>
              <Text style={styles.errorText}>Preparing video on desktop...</Text>
              <Text style={styles.channel}>
                {prepareProgress !== null
                  ? `Download progress ${Math.max(0, Math.round(prepareProgress))}%`
                  : "Please wait"}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.errorText}>
                {prepareError ?? "Video source is not available"}
              </Text>
              {id && effectiveServerUrl ? (
                <TVFocusPressable
                  style={styles.retryPrepareButton}
                  onPress={() => setPrepareRetryVersion((prev) => prev + 1)}
                >
                  <Text style={styles.retryPrepareButtonText}>Retry Download</Text>
                </TVFocusPressable>
              ) : null}
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.fullscreenContainer}>
      <VideoView player={player} style={styles.video} contentFit="contain" />

      {isRemoteNavVisible ? (
        <SafeAreaView style={styles.overlaySafeArea} edges={["top"]}>
          <View style={styles.overlayTopRow}>
            <View style={styles.titleChip}>
              <Text style={styles.titleChipText} numberOfLines={1}>
                {video?.title ?? "Now Playing"}
              </Text>
              <Text style={styles.titleChipMeta} numberOfLines={1}>
                {nextVideo && prefetchState === "loading"
                  ? `Loading next: ${nextVideo.title}`
                  : nextVideo
                    ? `Up next: ${nextVideo.title}`
                    : playbackModeLabel}
              </Text>
            </View>

            <View style={styles.navFabRow}>
              <TVFocusPressable
                style={styles.navFabButton}
                onPress={() => {
                  showRemoteNav();
                  router.back();
                }}
                onFocus={showRemoteNav}
                onBlur={showRemoteNav}
                hasTVPreferredFocus={isRemoteNavVisible}
              >
                <Text style={styles.navFabText}>Back</Text>
              </TVFocusPressable>

              <TVFocusPressable
                style={[styles.navFabButton, !hasPrevious && styles.navButtonDisabled]}
                onPress={() => {
                  showRemoteNav();
                  goToIndex(playlistIndex - 1);
                }}
                onFocus={showRemoteNav}
                onBlur={showRemoteNav}
                disabled={!hasPrevious}
              >
                <Text style={styles.navFabText}>Prev</Text>
              </TVFocusPressable>

              <TVFocusPressable
                style={[styles.navFabButton, !hasNext && styles.navButtonDisabled]}
                onPress={() => {
                  showRemoteNav();
                  goToIndex(playlistIndex + 1);
                }}
                onFocus={showRemoteNav}
                onBlur={showRemoteNav}
                disabled={!hasNext}
              >
                <Text style={styles.navFabText}>Next</Text>
              </TVFocusPressable>
            </View>
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#132447",
    paddingHorizontal: 32,
    paddingBottom: 20,
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  backButton: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#ffd93d",
    backgroundColor: "#ff6b6b",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  backButtonText: {
    color: "#fffef2",
    fontSize: 20,
    fontWeight: "900",
  },
  navButton: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#ffd93d",
    backgroundColor: "#ff8a00",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  video: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  overlaySafeArea: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 28,
    paddingTop: 10,
  },
  overlayTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  titleChip: {
    flex: 1,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.28)",
  },
  titleChipText: {
    color: "#fffef2",
    fontSize: 18,
    fontWeight: "800",
  },
  titleChipMeta: {
    marginTop: 4,
    color: "#dbeafe",
    fontSize: 14,
    fontWeight: "700",
  },
  navFabRow: {
    flexDirection: "row",
    gap: 12,
  },
  navFabButton: {
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#ffd93d",
    backgroundColor: "#ff8a00",
    paddingHorizontal: 20,
    paddingVertical: 10,
    minWidth: 102,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  navFabText: {
    color: "#fffef2",
    fontSize: 18,
    fontWeight: "900",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: "#fecaca",
    fontSize: 22,
    fontWeight: "700",
  },
  channel: {
    color: "#e5f2ff",
    fontSize: 20,
    fontWeight: "700",
    marginTop: 8,
  },
  retryPrepareButton: {
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#ffd93d",
    backgroundColor: "#2d7ff9",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryPrepareButtonText: {
    color: "#fffef2",
    fontSize: 20,
    fontWeight: "900",
  },
});
