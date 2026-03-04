import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  Platform,
} from "react-native";
import { Link, useRouter, type Href } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLibraryStore } from "../../stores/library";
import { useDownloadStore } from "../../stores/downloads";
import { useConnectionStore } from "../../stores/connection";
import { usePlaybackStore, type StreamingVideo } from "../../stores/playback";
import { VideoCard } from "../../components/VideoCard";
import {
  getAllSavedPlaylistsWithProgress,
  getSavedPlaylistWithItems,
} from "../../db/repositories/playlists";
import * as watchHistoryRepo from "../../db/repositories/watchHistory";
import { getVideoLocalPath } from "../../services/downloader";
import { colors, spacing, radius, fontSize, fontWeight } from "../../theme";

type SavedPlaylistInfo = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  type: string;
  downloadedCount: number;
  totalCount: number;
};

type PlaylistResumeInfo = {
  videoId: string;
  startSeconds: number;
  label: string;
};

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function createResumeLabel(seconds: number): string {
  return `Resume ${formatDuration(seconds)}`;
}

function clampResumeStart(positionSeconds: number, durationSeconds: number): number {
  const maxDuration = durationSeconds > 0 ? durationSeconds : Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.min(Math.floor(positionSeconds), maxDuration));
}

interface SavedPlaylistCardProps {
  playlist: SavedPlaylistInfo;
  onOpenPress: () => void;
  onResumePress?: () => void;
  resumeLabel?: string;
  isTv: boolean;
  hasTVPreferredFocus?: boolean;
}

function SavedPlaylistCard({
  playlist,
  onOpenPress,
  onResumePress,
  resumeLabel,
  isTv,
  hasTVPreferredFocus = false,
}: SavedPlaylistCardProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isResumeFocused, setIsResumeFocused] = useState(false);

  return (
    <View style={[styles.playlistCardShell, isTv && styles.playlistCardShellTv]}>
      <Pressable
        style={[styles.playlistCard, isTv && isFocused && styles.playlistCardFocused]}
        onPress={onOpenPress}
        focusable={isTv}
        hasTVPreferredFocus={hasTVPreferredFocus}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      >
        <View style={styles.playlistThumbnail}>
          {playlist.thumbnailUrl ? (
            <Image
              source={{ uri: playlist.thumbnailUrl }}
              style={styles.playlistImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.playlistPlaceholder}>
              <Text style={styles.playlistPlaceholderText}>{playlist.title.charAt(0)}</Text>
            </View>
          )}
        </View>
        <Text style={styles.playlistTitle} numberOfLines={2}>
          {playlist.title}
        </Text>
        <View style={styles.playlistProgress}>
          <View style={styles.playlistProgressBar}>
            <View
              style={[
                styles.playlistProgressFill,
                {
                  width: `${playlist.totalCount > 0
                    ? (playlist.downloadedCount / playlist.totalCount) * 100
                    : 0
                    }%`,
                },
              ]}
            />
          </View>
          <Text style={styles.playlistProgressText}>
            {playlist.downloadedCount}/{playlist.totalCount}
          </Text>
        </View>
      </Pressable>

      {onResumePress && resumeLabel ? (
        <Pressable
          style={[
            styles.playlistResumeButton,
            isTv && styles.playlistResumeButtonTv,
            isTv && isResumeFocused && styles.playlistResumeButtonFocused,
          ]}
          onPress={onResumePress}
          focusable={isTv}
          onFocus={() => setIsResumeFocused(true)}
          onBlur={() => setIsResumeFocused(false)}
        >
          <Text style={styles.playlistResumeText} numberOfLines={1}>
            {resumeLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function ListsScreen() {
  const router = useRouter();
  const isTv = Platform.isTV;

  const videos = useLibraryStore((state) => state.videos);
  const downloadQueue = useDownloadStore((state) => state.queue);
  const serverUrl = useConnectionStore((state) => state.serverUrl);
  const startPlaylist = usePlaybackStore((state) => state.startPlaylist);

  const [savedPlaylists, setSavedPlaylists] = useState<SavedPlaylistInfo[]>([]);
  const [watchHistoryLookup, setWatchHistoryLookup] =
    useState<watchHistoryRepo.WatchHistoryLookup>({});

  const loadData = useCallback(() => {
    const playlists = getAllSavedPlaylistsWithProgress();
    setSavedPlaylists(playlists);
    setWatchHistoryLookup(watchHistoryRepo.getWatchHistoryLookup(1500));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, videos]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const downloadedVideos = videos.filter((v) => !!v.localPath);
  const activeDownloads = downloadQueue.filter((d) => d.status === "downloading");
  const queuedDownloads = downloadQueue.filter((d) => d.status === "queued");

  const localPathByVideoId = useMemo(() => {
    const map = new Map<string, string>();
    for (const video of videos) {
      if (video.localPath) {
        map.set(video.id, video.localPath);
      }
    }
    return map;
  }, [videos]);

  const getVideoResumeSeconds = useCallback(
    (videoId: string, duration: number) => {
      const item = watchHistoryLookup[videoId];
      if (!item) return 0;
      return clampResumeStart(item.lastPositionSeconds, duration);
    },
    [watchHistoryLookup]
  );

  const playlistResumeById = useMemo(() => {
    const result = new Map<string, PlaylistResumeInfo>();

    for (const playlist of savedPlaylists) {
      const fullPlaylist = getSavedPlaylistWithItems(playlist.id);
      if (!fullPlaylist || fullPlaylist.items.length === 0) continue;

      const mostRecent = watchHistoryRepo.getMostRecentWatchForVideoIds(
        fullPlaylist.items.map((item) => item.videoId),
        watchHistoryLookup
      );
      if (!mostRecent) continue;

      const startSeconds = clampResumeStart(
        mostRecent.lastPositionSeconds,
        mostRecent.duration
      );
      if (startSeconds <= 0) continue;

      result.set(playlist.id, {
        videoId: mostRecent.videoId,
        startSeconds,
        label: createResumeLabel(startSeconds),
      });
    }

    return result;
  }, [savedPlaylists, watchHistoryLookup]);

  const handlePlaylistPress = useCallback(
    (playlistId: string) => {
      router.push(`/saved-playlist/${playlistId}`);
    },
    [router]
  );

  const handleResumePlaylistPress = useCallback(
    (playlistId: string) => {
      const fullPlaylist = getSavedPlaylistWithItems(playlistId);
      if (!fullPlaylist || fullPlaylist.items.length === 0) {
        return;
      }

      const resumeInfo = playlistResumeById.get(playlistId);
      const resumeVideoId = resumeInfo?.videoId ?? fullPlaylist.items[0].videoId;

      const playlistVideos: StreamingVideo[] = fullPlaylist.items.map((item) => ({
        id: item.videoId,
        title: item.title,
        channelTitle: item.channelTitle,
        duration: item.duration,
        thumbnailUrl: item.thumbnailUrl ?? undefined,
        localPath:
          localPathByVideoId.get(item.videoId) ??
          getVideoLocalPath(item.videoId) ??
          undefined,
      }));

      const playableVideos = serverUrl
        ? playlistVideos
        : playlistVideos.filter((item) => !!item.localPath);

      if (playableVideos.length === 0) {
        Alert.alert(
          "Offline mode",
          "Reconnect to desktop or download videos to resume this playlist."
        );
        return;
      }

      const startIndex = playableVideos.findIndex((item) => item.id === resumeVideoId);
      const safeStartIndex = startIndex >= 0 ? startIndex : 0;
      const selectedVideo = playableVideos[safeStartIndex];
      const startSeconds =
        safeStartIndex === startIndex ? resumeInfo?.startSeconds ?? 0 : 0;

      startPlaylist(
        `saved-${fullPlaylist.id}`,
        fullPlaylist.title,
        playableVideos,
        safeStartIndex,
        serverUrl ?? undefined
      );

      const route =
        startSeconds > 0
          ? (`/player/${selectedVideo.id}?start=${startSeconds}` as Href)
          : (`/player/${selectedVideo.id}` as Href);
      router.push(route);
    },
    [localPathByVideoId, playlistResumeById, router, serverUrl, startPlaylist]
  );

  const renderPlaylistCard = (playlist: SavedPlaylistInfo, index: number) => {
    const resumeInfo = playlistResumeById.get(playlist.id);

    return (
      <SavedPlaylistCard
        key={playlist.id}
        playlist={playlist}
        onOpenPress={() => handlePlaylistPress(playlist.id)}
        onResumePress={
          resumeInfo ? () => handleResumePlaylistPress(playlist.id) : undefined
        }
        resumeLabel={resumeInfo?.label}
        isTv={isTv}
        hasTVPreferredFocus={isTv && index === 0}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {videos.length === 0 && savedPlaylists.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📚</Text>
          <Text style={styles.emptyTitle}>No Videos Yet</Text>
          <Text style={styles.emptyText}>
            Sync videos from your LearnifyTube desktop app
          </Text>
          <Link href="/(tabs)/settings" asChild>
            <Pressable style={styles.syncButton} focusable={isTv} hasTVPreferredFocus={isTv}>
              <Text style={styles.syncButtonText}>Sync Videos</Text>
            </Pressable>
          </Link>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {savedPlaylists.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Saved Playlists</Text>
              {isTv ? (
                <View style={styles.playlistsGrid}>
                  {savedPlaylists.map((playlist, index) =>
                    renderPlaylistCard(playlist, index)
                  )}
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.playlistsRow}
                >
                  {savedPlaylists.map((playlist, index) =>
                    renderPlaylistCard(playlist, index)
                  )}
                </ScrollView>
              )}
            </View>
          )}

          <View style={styles.header}>
            <View style={styles.headerInfo}>
              <Text style={styles.headerText}>
                {downloadedVideos.length} video
                {downloadedVideos.length !== 1 ? "s" : ""} downloaded
              </Text>
              {(activeDownloads.length > 0 || queuedDownloads.length > 0) && (
                <View style={styles.downloadStatus}>
                  {activeDownloads.length > 0 && (
                    <Text style={styles.downloadStatusText}>
                      {activeDownloads.length} downloading
                      {activeDownloads[0] && ` (${activeDownloads[0].progress}%)`}
                    </Text>
                  )}
                  {queuedDownloads.length > 0 && (
                    <Text style={styles.queuedStatusText}>
                      {queuedDownloads.length} queued
                    </Text>
                  )}
                </View>
              )}
            </View>
          </View>

          {videos.length > 0 && (
            <View style={[styles.videosGrid, isTv && styles.videosGridTv]}>
              {videos.map((video, index) => {
                const resumeSeconds = getVideoResumeSeconds(video.id, video.duration);
                const playerHref =
                  resumeSeconds > 0
                    ? (`/player/${video.id}?start=${resumeSeconds}` as Href)
                    : (`/player/${video.id}` as Href);

                return (
                  <VideoCard
                    key={video.id}
                    video={video}
                    playerHref={playerHref}
                    resumeLabel={
                      resumeSeconds > 0 ? createResumeLabel(resumeSeconds) : undefined
                    }
                    hasTVPreferredFocus={isTv && savedPlaylists.length === 0 && index === 0}
                    style={[
                      styles.downloadedVideoCard,
                      isTv && styles.downloadedVideoCardTv,
                    ]}
                  />
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  section: {
    paddingTop: spacing.md,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm + 4,
  },
  playlistsRow: {
    paddingHorizontal: spacing.sm + 4,
    gap: spacing.sm + 4,
  },
  playlistsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.sm + 4,
    justifyContent: "space-between",
  },
  playlistCardShell: {
    width: 150,
    marginRight: spacing.sm + 4,
  },
  playlistCardShellTv: {
    width: "31.5%",
    marginRight: 0,
    marginBottom: spacing.md,
  },
  playlistCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.sm + 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  playlistCardFocused: {
    borderColor: colors.ring,
    backgroundColor: colors.cardHover,
    shadowColor: colors.ring,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  playlistThumbnail: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.muted,
    marginBottom: spacing.sm,
  },
  playlistImage: {
    width: "100%",
    height: "100%",
  },
  playlistPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  playlistPlaceholderText: {
    color: colors.primaryForeground,
    fontSize: 32,
    fontWeight: "700",
  },
  playlistTitle: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  playlistProgress: {
    gap: spacing.xs,
  },
  playlistProgressBar: {
    height: 4,
    backgroundColor: colors.muted,
    borderRadius: 2,
    overflow: "hidden",
  },
  playlistProgressFill: {
    height: "100%",
    backgroundColor: colors.success,
  },
  playlistProgressText: {
    color: colors.mutedForeground,
    fontSize: 11,
  },
  playlistResumeButton: {
    marginTop: spacing.xs + 2,
    marginBottom: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: `${colors.primary}66`,
    backgroundColor: `${colors.primary}22`,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    alignItems: "center",
  },
  playlistResumeButtonTv: {
    paddingVertical: 10,
  },
  playlistResumeButtonFocused: {
    borderColor: colors.ring,
    backgroundColor: `${colors.primary}33`,
  },
  playlistResumeText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerInfo: {
    flex: 1,
  },
  headerText: {
    color: colors.mutedForeground,
    fontSize: fontSize.base,
  },
  downloadStatus: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  downloadStatusText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  queuedStatusText: {
    color: colors.mutedForeground,
    fontSize: fontSize.sm,
  },
  videosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.sm + 2,
    paddingTop: spacing.sm,
    justifyContent: "space-between",
  },
  videosGridTv: {
    paddingHorizontal: spacing.md - 2,
  },
  downloadedVideoCard: {
    flex: 0,
    width: "48%",
    maxWidth: "48%",
    margin: 0,
    marginBottom: spacing.sm + 2,
  },
  downloadedVideoCardTv: {
    width: "31.5%",
    maxWidth: "31.5%",
    marginBottom: spacing.md,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    color: colors.foreground,
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  emptyText: {
    color: colors.mutedForeground,
    fontSize: fontSize.md,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  syncButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 6,
    borderRadius: radius.lg,
  },
  syncButtonText: {
    color: colors.primaryForeground,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
});
