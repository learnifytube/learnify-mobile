import { useEffect, useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSyncStore } from "../stores/sync";
import { useConnectionStore } from "../stores/connection";
import { useLibraryStore } from "../stores/library";
import { useDownloadStore } from "../stores/downloads";
import { usePlaybackStore } from "../stores/playback";
import { savePlaylist } from "../db/repositories/playlists";
import {
  SyncTabBar,
  ChannelList,
  PlaylistList,
  VideoListItem,
  MyListsList,
  SubscriptionVideoGridItem,
} from "../components/sync";
import type {
  RemoteChannel,
  RemotePlaylist,
  RemoteVideoWithStatus,
  RemoteMyList,
} from "../types";
import type { StreamingVideo } from "../stores/playback";
import { api } from "../services/api";
import { getVideoLocalPath, videoExistsLocally } from "../services/downloader";

export default function SyncScreen() {
  const router = useRouter();
  const serverUrl = useConnectionStore((s) => s.serverUrl);
  const libraryVideos = useLibraryStore((s) => s.videos);
  const queueDownload = useDownloadStore((s) => s.queueDownload);
  const startPlaylist = usePlaybackStore((s) => s.startPlaylist);

  const {
    activeTab,
    setActiveTab,
    channels,
    playlists,
    myLists,
    isLoadingChannels,
    isLoadingPlaylists,
    isLoadingVideos,
    isLoadingSubscriptions,
    isLoadingMyLists,
    channelsError,
    playlistsError,
    subscriptionsError,
    myListsError,
    videosError,
    selectedChannel,
    channelVideos,
    selectedPlaylist,
    playlistVideos,
    subscriptionVideos,
    selectedMyList,
    myListVideos,
    selectedVideoIds,
    fetchChannels,
    fetchPlaylists,
    fetchSubscriptions,
    fetchMyLists,
    fetchChannelVideos,
    fetchPlaylistVideos,
    fetchMyListVideos,
    selectChannel,
    selectPlaylist,
    selectMyList,
    toggleVideoSelection,
    selectAllVideos,
    clearVideoSelection,
  } = useSyncStore();

  // Set of video IDs already synced to mobile
  const syncedVideoIds = new Set(libraryVideos.map((v) => v.id));

  const [pendingVideoIds, setPendingVideoIds] = useState<Set<string>>(new Set());

  const setPending = useCallback((videoId: string, isPending: boolean) => {
    setPendingVideoIds((prev) => {
      const next = new Set(prev);
      if (isPending) {
        next.add(videoId);
      } else {
        next.delete(videoId);
      }
      return next;
    });
  }, []);

  // Fetch data when tab changes or on mount
  useEffect(() => {
    if (!serverUrl) return;

    if (activeTab === "channels" && channels.length === 0) {
      fetchChannels(serverUrl);
    } else if (activeTab === "playlists" && playlists.length === 0) {
      fetchPlaylists(serverUrl);
    } else if (activeTab === "subscriptions" && subscriptionVideos.length === 0) {
      fetchSubscriptions(serverUrl);
    } else if (activeTab === "mylists" && myLists.length === 0) {
      fetchMyLists(serverUrl);
    }
  }, [
    activeTab,
    serverUrl,
    channels.length,
    playlists.length,
    subscriptionVideos.length,
    myLists.length,
    fetchChannels,
    fetchPlaylists,
    fetchSubscriptions,
    fetchMyLists,
  ]);

  useEffect(() => {
    if (!serverUrl) {
      setPendingVideoIds(new Set());
      clearVideoSelection();
    }
  }, [serverUrl, clearVideoSelection]);

  const hasCachedData =
    channels.length > 0 ||
    playlists.length > 0 ||
    myLists.length > 0 ||
    subscriptionVideos.length > 0;

  const showOfflineAlert = useCallback(() => {
    Alert.alert(
      "Offline mode",
      "Reconnect to your desktop app to refresh or sync new videos."
    );
  }, []);

  const handleRefreshChannels = useCallback(() => {
    if (serverUrl) {
      fetchChannels(serverUrl);
      return;
    }
    showOfflineAlert();
  }, [serverUrl, fetchChannels, showOfflineAlert]);

  const handleRefreshPlaylists = useCallback(() => {
    if (serverUrl) {
      fetchPlaylists(serverUrl);
      return;
    }
    showOfflineAlert();
  }, [serverUrl, fetchPlaylists, showOfflineAlert]);

  const handleRefreshSubscriptions = useCallback(() => {
    if (serverUrl) {
      fetchSubscriptions(serverUrl);
      return;
    }
    showOfflineAlert();
  }, [serverUrl, fetchSubscriptions, showOfflineAlert]);

  const handleRefreshMyLists = useCallback(() => {
    if (serverUrl) {
      fetchMyLists(serverUrl);
      return;
    }
    showOfflineAlert();
  }, [serverUrl, fetchMyLists, showOfflineAlert]);

  const handleChannelPress = useCallback(
    (channel: RemoteChannel) => {
      if (serverUrl) {
        fetchChannelVideos(serverUrl, channel);
        return;
      }
      selectChannel(channel);
    },
    [serverUrl, fetchChannelVideos, selectChannel]
  );

  const handlePlaylistPress = useCallback(
    (playlist: RemotePlaylist) => {
      if (serverUrl) {
        fetchPlaylistVideos(serverUrl, playlist);
        return;
      }
      selectPlaylist(playlist);
    },
    [serverUrl, fetchPlaylistVideos, selectPlaylist]
  );

  const handleMyListPress = useCallback(
    (myList: RemoteMyList) => {
      if (serverUrl) {
        fetchMyListVideos(serverUrl, myList);
        return;
      }
      selectMyList(myList);
    },
    [serverUrl, fetchMyListVideos, selectMyList]
  );

  const handleBackPress = useCallback(() => {
    if (selectedChannel) {
      selectChannel(null);
    } else if (selectedPlaylist) {
      selectPlaylist(null);
    } else if (selectedMyList) {
      selectMyList(null);
    }
  }, [
    selectedChannel,
    selectedPlaylist,
    selectedMyList,
    selectChannel,
    selectPlaylist,
    selectMyList,
  ]);

  const sleep = useCallback(
    (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }),
    []
  );

  const waitForServerDownload = useCallback(
    async (videoId: string) => {
      if (!serverUrl) throw new Error("Not connected to server");
      const timeoutMs = 10 * 60 * 1000;
      const intervalMs = 2000;
      const start = Date.now();

      while (Date.now() - start < timeoutMs) {
        const status = await api.getServerDownloadStatus(serverUrl, videoId);
        if (status.status === "completed") return;
        if (status.status === "failed") {
          throw new Error(status.error || "Server download failed");
        }
        await sleep(intervalMs);
      }

      throw new Error("Server download timed out");
    },
    [serverUrl, sleep]
  );

  const waitForLocalVideo = useCallback(
    async (videoId: string) => {
      const timeoutMs = 10 * 60 * 1000;
      const intervalMs = 1000;
      const start = Date.now();

      while (Date.now() - start < timeoutMs) {
        if (videoExistsLocally(videoId)) return;
        await sleep(intervalMs);
      }

      throw new Error("Sync to mobile timed out");
    },
    [sleep]
  );

  const playSubscriptionVideo = useCallback(
    (video: RemoteVideoWithStatus) => {
      const localPath =
        getVideoLocalPath(video.id) ??
        libraryVideos.find((v) => v.id === video.id)?.localPath;
      if (!serverUrl && !localPath) {
        Alert.alert(
          "Offline mode",
          "This video is not downloaded on mobile yet."
        );
        return;
      }

      const streamingVideo: StreamingVideo = {
        id: video.id,
        title: video.title,
        channelTitle: video.channelTitle,
        duration: video.duration,
        thumbnailUrl: video.thumbnailUrl ?? undefined,
        localPath: localPath ?? undefined,
      };

      startPlaylist(
        "subscriptions",
        "Subscriptions",
        [streamingVideo],
        0,
        serverUrl ?? undefined
      );
      router.push(`/player/${video.id}`);
    },
    [libraryVideos, serverUrl, startPlaylist, router]
  );

  const handleSubscriptionVideoPress = useCallback(
    async (video: RemoteVideoWithStatus) => {
      if (videoExistsLocally(video.id)) {
        playSubscriptionVideo(video);
        return;
      }
      if (!serverUrl) {
        Alert.alert(
          "Offline mode",
          "Reconnect to desktop to stream or sync this video."
        );
        return;
      }
      if (pendingVideoIds.has(video.id)) return;

      setPending(video.id, true);
      try {
        const response = await api.requestServerDownload(serverUrl, { videoId: video.id });
        if (!response.success && !response.status) {
          throw new Error(response.message || "Server refused download request");
        }
        await waitForServerDownload(video.id);

        if (!videoExistsLocally(video.id)) {
          queueDownload(video.id, {
            title: video.title,
            channelTitle: video.channelTitle,
            duration: video.duration,
            thumbnailUrl: video.thumbnailUrl ?? undefined,
          });
          await waitForLocalVideo(video.id);
        }

        playSubscriptionVideo(video);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to prepare video";
        Alert.alert("Unable to play video", message);
      } finally {
        setPending(video.id, false);
      }
    },
    [
      serverUrl,
      pendingVideoIds,
      setPending,
      queueDownload,
      waitForServerDownload,
      waitForLocalVideo,
      playSubscriptionVideo,
    ]
  );

  const handlePlayVideo = useCallback(
    (video: RemoteVideoWithStatus) => {
      const localPath =
        getVideoLocalPath(video.id) ??
        libraryVideos.find((v) => v.id === video.id)?.localPath;
      if (!serverUrl && !localPath) {
        Alert.alert(
          "Offline mode",
          "This video is not downloaded on mobile yet."
        );
        return;
      }

      const streamingVideo: StreamingVideo = {
        id: video.id,
        title: video.title,
        channelTitle: video.channelTitle,
        duration: video.duration,
        thumbnailUrl: video.thumbnailUrl ?? undefined,
        localPath: localPath ?? undefined,
      };

      let contextTitle = "Now Playing";
      let contextId = `single-${video.id}`;
      let currentVideos: RemoteVideoWithStatus[] = [];

      if (selectedChannel) {
        contextTitle = selectedChannel.channelTitle;
        contextId = `channel-${selectedChannel.channelId}`;
        currentVideos = channelVideos;
      } else if (selectedPlaylist) {
        contextTitle = selectedPlaylist.title;
        contextId = `playlist-${selectedPlaylist.playlistId}`;
        currentVideos = playlistVideos;
      } else if (selectedMyList) {
        contextTitle = selectedMyList.name;
        contextId = `mylist-${selectedMyList.id}`;
        currentVideos = myListVideos;
      } else if (activeTab === "subscriptions") {
        contextTitle = "Subscriptions";
        contextId = "subscriptions";
        currentVideos = subscriptionVideos;
      }

      const playlistStreamingVideos: StreamingVideo[] = currentVideos.map(
        (v) => {
          const local =
            getVideoLocalPath(v.id) ??
            libraryVideos.find((lv) => lv.id === v.id)?.localPath;
          return {
            id: v.id,
            title: v.title,
            channelTitle: v.channelTitle,
            duration: v.duration,
            thumbnailUrl: v.thumbnailUrl ?? undefined,
            localPath: local ?? undefined,
          };
        }
      );
      const playablePlaylistVideos = serverUrl
        ? playlistStreamingVideos
        : playlistStreamingVideos.filter((v) => !!v.localPath);

      const startIndex = playablePlaylistVideos.findIndex(
        (v) => v.id === video.id
      );
      const fallbackVideos =
        serverUrl || streamingVideo.localPath ? [streamingVideo] : [];
      const videosToPlay =
        playablePlaylistVideos.length > 0 ? playablePlaylistVideos : fallbackVideos;

      if (videosToPlay.length === 0) {
        Alert.alert(
          "Offline mode",
          "No playable video source is available."
        );
        return;
      }

      startPlaylist(
        contextId,
        contextTitle,
        videosToPlay,
        startIndex >= 0 ? startIndex : 0,
        serverUrl ?? undefined
      );

      router.push(`/player/${video.id}`);
    },
    [
      serverUrl,
      libraryVideos,
      selectedChannel,
      selectedPlaylist,
      selectedMyList,
      activeTab,
      channelVideos,
      playlistVideos,
      subscriptionVideos,
      myListVideos,
      startPlaylist,
      router,
    ]
  );

  const handleSyncVideo = useCallback(
    (video: RemoteVideoWithStatus) => {
      if (!serverUrl || video.downloadStatus !== "completed") return;

      queueDownload(video.id, {
        title: video.title,
        channelTitle: video.channelTitle,
        duration: video.duration,
        thumbnailUrl: video.thumbnailUrl ?? undefined,
      });
    },
    [serverUrl, queueDownload]
  );

  const handleSyncSelected = useCallback(() => {
    let videos: RemoteVideoWithStatus[] = [];
    if (activeTab === "channels") videos = channelVideos;
    else if (activeTab === "playlists") videos = playlistVideos;
    else if (activeTab === "subscriptions") videos = subscriptionVideos;
    else if (activeTab === "mylists") videos = myListVideos;

    for (const video of videos) {
      if (
        selectedVideoIds.has(video.id) &&
        video.downloadStatus === "completed" &&
        !syncedVideoIds.has(video.id)
      ) {
        queueDownload(video.id, {
          title: video.title,
          channelTitle: video.channelTitle,
          duration: video.duration,
          thumbnailUrl: video.thumbnailUrl ?? undefined,
        });
      }
    }
    clearVideoSelection();
  }, [
    activeTab,
    channelVideos,
    playlistVideos,
    subscriptionVideos,
    myListVideos,
    selectedVideoIds,
    syncedVideoIds,
    queueDownload,
    clearVideoSelection,
  ]);

  if (!serverUrl && !hasCachedData) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Not connected to server</Text>
        <Pressable
          style={styles.connectButton}
          onPress={() => router.push("/connect")}
        >
          <Text style={styles.connectButtonText}>Connect</Text>
        </Pressable>
      </View>
    );
  }

  // Video list view for selected channel/playlist/subscription/mylist
  const isShowingVideos = selectedChannel || selectedPlaylist || selectedMyList;

  const getCurrentVideos = () => {
    if (selectedChannel) return channelVideos;
    if (selectedPlaylist) return playlistVideos;
    if (selectedMyList) return myListVideos;
    return [];
  };
  const currentVideos = getCurrentVideos();

  const getCurrentTitle = () => {
    if (selectedChannel) return selectedChannel.channelTitle;
    if (selectedPlaylist) return selectedPlaylist.title;
    if (selectedMyList) return selectedMyList.name;
    return "";
  };
  const currentTitle = getCurrentTitle();

  if (isShowingVideos) {
    // Videos available on server (downloaded on desktop)
    const availableVideos = currentVideos.filter(
      (v) => v.downloadStatus === "completed"
    );
    // Videos not yet synced to mobile
    const syncableCount = serverUrl
      ? availableVideos.filter((v) => !syncedVideoIds.has(v.id)).length
      : 0;
    // Videos already saved locally
    const savedCount = availableVideos.filter((v) =>
      syncedVideoIds.has(v.id)
    ).length;
    const totalAvailable = availableVideos.length;
    const isFullySaved = savedCount === totalAvailable && totalAvailable > 0;

    const handleSavePlaylistOffline = () => {
      // Determine playlist info based on what's selected
      let playlistId = "";
      let playlistTitle = "";
      let playlistType = "";
      let sourceId: string | null = null;
      let thumbnailUrl: string | null = null;

      if (selectedChannel) {
        playlistId = `channel_${selectedChannel.channelId}`;
        playlistTitle = selectedChannel.channelTitle;
        playlistType = "channel";
        sourceId = selectedChannel.channelId;
        thumbnailUrl = selectedChannel.thumbnailUrl;
      } else if (selectedPlaylist) {
        playlistId = `playlist_${selectedPlaylist.playlistId}`;
        playlistTitle = selectedPlaylist.title;
        playlistType = "playlist";
        sourceId = selectedPlaylist.channelId;
        thumbnailUrl = selectedPlaylist.thumbnailUrl;
      } else if (selectedMyList) {
        playlistId = `mylist_${selectedMyList.id}`;
        playlistTitle = selectedMyList.name;
        playlistType = "mylist";
        sourceId = selectedMyList.id;
        thumbnailUrl = selectedMyList.thumbnailUrl;
      }

      // Save playlist metadata with all videos (not just available ones)
      if (playlistId) {
        const videoInfos = currentVideos.map((v) => ({
          videoId: v.id,
          title: v.title,
          channelTitle: v.channelTitle,
          duration: v.duration,
          thumbnailUrl: v.thumbnailUrl ?? undefined,
        }));

        savePlaylist(playlistId, playlistTitle, playlistType, sourceId, thumbnailUrl, videoInfos);
      }

      if (!serverUrl) {
        return;
      }

      // Queue downloads for videos not yet synced
      for (const video of availableVideos) {
        if (!syncedVideoIds.has(video.id)) {
          queueDownload(video.id, {
            title: video.title,
            channelTitle: video.channelTitle,
            duration: video.duration,
            thumbnailUrl: video.thumbnailUrl ?? undefined,
          });
        }
      }
    };

    return (
      <View style={styles.container}>
        {/* Header with back button */}
        <View style={styles.videoHeader}>
          <Pressable style={styles.backButton} onPress={handleBackPress}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {currentTitle}
            </Text>
            <Text style={styles.headerSubtitle}>
              {totalAvailable > 0
                ? `${savedCount}/${totalAvailable} saved offline`
                : `${currentVideos.length} videos`}
            </Text>
          </View>
          {/* Save Offline Button */}
          {currentVideos.length > 0 && serverUrl && (
            <Pressable
              style={[
                styles.saveOfflineButton,
                isFullySaved && styles.saveOfflineButtonDisabled,
              ]}
              onPress={handleSavePlaylistOffline}
              disabled={isFullySaved}
            >
              <Text style={styles.saveOfflineButtonText}>
                {isFullySaved ? "✓ Saved" : "Save All"}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Progress bar */}
        {totalAvailable > 0 && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(savedCount / totalAvailable) * 100}%` },
                ]}
              />
            </View>
          </View>
        )}

        {/* Selection toolbar */}
        {syncableCount > 0 && (
          <View style={styles.toolbar}>
            <Pressable
              style={styles.toolbarButton}
              onPress={
                selectedVideoIds.size > 0 ? clearVideoSelection : selectAllVideos
              }
            >
              <Text style={styles.toolbarButtonText}>
                {selectedVideoIds.size > 0
                  ? `Deselect (${selectedVideoIds.size})`
                  : `Select All (${syncableCount})`}
              </Text>
            </Pressable>
            {selectedVideoIds.size > 0 && (
              <Pressable style={styles.syncAllButton} onPress={handleSyncSelected}>
                <Text style={styles.syncAllButtonText}>
                  Sync {selectedVideoIds.size} video
                  {selectedVideoIds.size !== 1 ? "s" : ""}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Video list */}
        {isLoadingVideos ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={styles.loadingText}>Loading videos...</Text>
          </View>
        ) : videosError ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>Failed to load videos</Text>
            <Text style={styles.errorDetail}>{videosError}</Text>
          </View>
        ) : currentVideos.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No videos found</Text>
          </View>
        ) : (
          <FlatList
            data={currentVideos}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <VideoListItem
                video={item}
                isSelected={selectedVideoIds.has(item.id)}
                isSyncedToMobile={syncedVideoIds.has(item.id)}
                onPress={() => {
                  if (
                    serverUrl &&
                    item.downloadStatus === "completed" &&
                    !syncedVideoIds.has(item.id)
                  ) {
                    toggleVideoSelection(item.id);
                  }
                }}
                onPlayPress={
                  item.downloadStatus === "completed" || syncedVideoIds.has(item.id)
                    ? () => handlePlayVideo(item)
                    : undefined
                }
                onSyncPress={
                  serverUrl &&
                  item.downloadStatus === "completed" &&
                  !syncedVideoIds.has(item.id)
                    ? () => handleSyncVideo(item)
                    : undefined
                }
              />
            )}
            contentContainerStyle={styles.videoList}
          />
        )}
      </View>
    );
  }

  // Tab-based list view
  return (
    <View style={styles.container}>
      {!serverUrl && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            Offline mode: showing cached data
          </Text>
          <Pressable
            style={styles.offlineBannerButton}
            onPress={() => router.push("/connect")}
          >
            <Text style={styles.offlineBannerButtonText}>Reconnect</Text>
          </Pressable>
        </View>
      )}
      <SyncTabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "channels" && (
        <ChannelList
          channels={channels}
          isLoading={isLoadingChannels}
          error={channelsError}
          onChannelPress={handleChannelPress}
          onRefresh={handleRefreshChannels}
        />
      )}

      {activeTab === "playlists" && (
        <PlaylistList
          playlists={playlists}
          isLoading={isLoadingPlaylists}
          error={playlistsError}
          serverUrl={serverUrl ?? undefined}
          onPlaylistPress={handlePlaylistPress}
          onRefresh={handleRefreshPlaylists}
        />
      )}

      {activeTab === "subscriptions" && (
        <>
          {isLoadingSubscriptions && subscriptionVideos.length === 0 ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#6366f1" />
              <Text style={styles.loadingText}>Loading subscriptions...</Text>
            </View>
          ) : subscriptionsError ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>Failed to load subscriptions</Text>
              <Text style={styles.errorDetail}>{subscriptionsError}</Text>
            </View>
          ) : subscriptionVideos.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No subscription videos yet</Text>
            </View>
          ) : (
            <FlatList
              data={subscriptionVideos}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.gridList}
              renderItem={({ item }) => (
                <SubscriptionVideoGridItem
                  video={item}
                  isPending={pendingVideoIds.has(item.id)}
                  onPress={() => handleSubscriptionVideoPress(item)}
                />
              )}
              refreshing={isLoadingSubscriptions}
              onRefresh={handleRefreshSubscriptions}
            />
          )}
        </>
      )}

      {activeTab === "mylists" && (
        <MyListsList
          myLists={myLists}
          isLoading={isLoadingMyLists}
          error={myListsError}
          onMyListPress={handleMyListPress}
          onRefresh={handleRefreshMyLists}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b",
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
    backgroundColor: "#111827",
  },
  offlineBannerText: {
    color: "#f3f4f6",
    fontSize: 13,
    fontWeight: "500",
  },
  offlineBannerButton: {
    backgroundColor: "#6366f1",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  offlineBannerButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  loadingText: {
    color: "#71717a",
    fontSize: 14,
    marginTop: 12,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  errorDetail: {
    color: "#71717a",
    fontSize: 13,
    textAlign: "center",
  },
  emptyText: {
    color: "#fafafa",
    fontSize: 18,
    fontWeight: "600",
  },
  connectButton: {
    marginTop: 16,
    backgroundColor: "#6366f1",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  connectButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  videoHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#09090b",
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#27272a",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  backIcon: {
    color: "#fafafa",
    fontSize: 18,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    color: "#fafafa",
    fontSize: 18,
    fontWeight: "600",
  },
  headerSubtitle: {
    color: "#71717a",
    fontSize: 13,
    marginTop: 2,
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#09090b",
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  toolbarButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#27272a",
  },
  toolbarButtonText: {
    color: "#fafafa",
    fontSize: 13,
    fontWeight: "500",
  },
  syncAllButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#6366f1",
  },
  syncAllButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  gridList: {
    padding: 16,
    paddingBottom: 24,
  },
  gridRow: {
    justifyContent: "space-between",
  },
  videoList: {
    paddingVertical: 8,
  },
  saveOfflineButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#22c55e",
  },
  saveOfflineButtonDisabled: {
    backgroundColor: "#27272a",
  },
  saveOfflineButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  progressContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#09090b",
  },
  progressBar: {
    height: 4,
    backgroundColor: "#27272a",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#22c55e",
    borderRadius: 2,
  },
});
