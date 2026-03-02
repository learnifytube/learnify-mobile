import { useEffect, useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Link, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLibraryStore } from "../../stores/library";
import { useDownloadStore } from "../../stores/downloads";
import { useConnectionStore } from "../../stores/connection";
import { useSyncStore } from "../../stores/sync";
import { usePlaybackStore } from "../../stores/playback";
import { savePlaylist } from "../../db/repositories/playlists";
import {
  SyncTabBar,
  ChannelList,
  PlaylistList,
  VideoListItem,
  MyListsList,
  SubscriptionVideoGridItem,
} from "../../components/sync";
import { colors, radius, spacing, fontSize, fontWeight } from "../../theme";
import { Smartphone, ArrowLeft, Play } from "../../theme/icons";
import type {
  RemoteChannel,
  RemotePlaylist,
  RemoteVideoWithStatus,
  RemoteMyList,
} from "../../types";
import type { StreamingVideo } from "../../stores/playback";
import { api } from "../../services/api";
import { getVideoLocalPath, videoExistsLocally } from "../../services/downloader";

export default function HomeScreen() {
  const serverUrl = useConnectionStore((s) => s.serverUrl);
  const serverName = useConnectionStore((s) => s.serverName);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const isConnected = !!serverUrl;

  const libraryVideos = useLibraryStore((s) => s.videos);
  const queueDownload = useDownloadStore((s) => s.queueDownload);
  const downloadQueue = useDownloadStore((s) => s.queue);

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
    favoritePlaylistIds,
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
    addToFavorites,
    removeFromFavorites,
  } = useSyncStore();

  const startPlaylist = usePlaybackStore((s) => s.startPlaylist);

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

  // Download status
  const activeDownloads = downloadQueue.filter((d) => d.status === "downloading");
  const queuedDownloads = downloadQueue.filter((d) => d.status === "queued");

  // Fetch data when tab changes or on connect
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

  // Clear pending actions when disconnected
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

  // Play a single video (streaming or local)
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

      // Create streaming video object
      const streamingVideo: StreamingVideo = {
        id: video.id,
        title: video.title,
        channelTitle: video.channelTitle,
        duration: video.duration,
        thumbnailUrl: video.thumbnailUrl ?? undefined,
        localPath: localPath ?? undefined,
      };

      // Determine the context title
      let contextTitle = "Now Playing";
      let contextId = `single-${video.id}`;
      if (selectedChannel) {
        contextTitle = selectedChannel.channelTitle;
        contextId = `channel-${selectedChannel.channelId}`;
      } else if (selectedPlaylist) {
        contextTitle = selectedPlaylist.title;
        contextId = `playlist-${selectedPlaylist.playlistId}`;
      } else if (selectedMyList) {
        contextTitle = selectedMyList.name;
        contextId = `mylist-${selectedMyList.id}`;
      } else if (activeTab === "subscriptions") {
        contextTitle = "Subscriptions";
        contextId = "subscriptions";
      }

      // Get the current video list for playlist context
      let currentVideos: RemoteVideoWithStatus[] = [];
      if (selectedChannel) currentVideos = channelVideos;
      else if (selectedPlaylist) currentVideos = playlistVideos;
      else if (selectedMyList) currentVideos = myListVideos;
      else if (activeTab === "subscriptions") currentVideos = subscriptionVideos;

      // Convert to StreamingVideo array
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

      // Find index of current video
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

  const handlePlaylistSavePress = useCallback(
    async (playlist: RemotePlaylist) => {
      if (!serverUrl) return;
      const entityType =
        playlist.type === "custom" ? "custom_playlist" : "channel_playlist";
      const isFavorited = favoritePlaylistIds.has(playlist.playlistId);

      try {
        if (isFavorited) {
          await removeFromFavorites(serverUrl, entityType, playlist.playlistId);
        } else {
          await addToFavorites(serverUrl, entityType, playlist.playlistId);
        }
      } catch (error) {
        console.error("[HomeScreen] Failed to toggle favorite:", error);
      }
    },
    [serverUrl, favoritePlaylistIds, addToFavorites, removeFromFavorites]
  );

  const handlePlayAll = useCallback(() => {
    // Determine current context and videos
    let contextTitle = "";
    let contextId = "";
    let currentVideos: RemoteVideoWithStatus[] = [];

    if (selectedPlaylist) {
      contextTitle = selectedPlaylist.title;
      contextId = `playlist-${selectedPlaylist.playlistId}`;
      currentVideos = playlistVideos;
    } else if (selectedChannel) {
      contextTitle = selectedChannel.channelTitle;
      contextId = `channel-${selectedChannel.channelId}`;
      currentVideos = channelVideos;
    } else if (selectedMyList) {
      contextTitle = selectedMyList.name;
      contextId = `mylist-${selectedMyList.id}`;
      currentVideos = myListVideos;
    } else if (activeTab === "subscriptions") {
      contextTitle = "Subscriptions";
      contextId = "subscriptions";
      currentVideos = subscriptionVideos;
    }

    const playableVideos = currentVideos.filter((v) => {
      if (serverUrl) {
        return v.downloadStatus === "completed";
      }
      return syncedVideoIds.has(v.id);
    });

    if (playableVideos.length === 0) {
      Alert.alert(
        "Offline mode",
        "No downloaded videos are available to play."
      );
      return;
    }

    // Convert to StreamingVideo array
    const streamingVideos: StreamingVideo[] = playableVideos.map((v) => {
      const localPath =
        getVideoLocalPath(v.id) ??
        libraryVideos.find((lv) => lv.id === v.id)?.localPath;
      return {
        id: v.id,
        title: v.title,
        channelTitle: v.channelTitle,
        duration: v.duration,
        thumbnailUrl: v.thumbnailUrl ?? undefined,
        localPath: localPath ?? undefined,
      };
    });
    const videosToPlay = serverUrl
      ? streamingVideos
      : streamingVideos.filter((v) => !!v.localPath);

    if (videosToPlay.length === 0) {
      Alert.alert(
        "Offline mode",
        "No downloaded videos are available to play."
      );
      return;
    }

    startPlaylist(
      contextId,
      contextTitle,
      videosToPlay,
      0,
      serverUrl ?? undefined
    );
    router.push(`/player/${videosToPlay[0].id}`);
  }, [
    serverUrl,
    syncedVideoIds,
    selectedPlaylist,
    selectedChannel,
    selectedMyList,
    activeTab,
    playlistVideos,
    channelVideos,
    subscriptionVideos,
    myListVideos,
    libraryVideos,
    startPlaylist,
  ]);

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

  // Not connected and no cache - show connect prompt
  if (!isConnected && !hasCachedData) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.emptyState}>
          <Smartphone size={64} color={colors.mutedForeground} />
          <Text style={styles.emptyTitle}>LearnifyTube</Text>
          <Text style={styles.emptyText}>
            Connect to your LearnifyTube desktop app to browse and sync videos
          </Text>
          <Link href="/connect" asChild>
            <Pressable style={styles.connectButton}>
              <Text style={styles.connectButtonText}>Connect to Desktop</Text>
            </Pressable>
          </Link>
        </View>
      </SafeAreaView>
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
    const syncableCount = serverUrl
      ? availableVideos.filter((v) => !syncedVideoIds.has(v.id)).length
      : 0;
    const savedCount = availableVideos.filter((v) =>
      syncedVideoIds.has(v.id)
    ).length;
    const totalAvailable = availableVideos.length;
    const isFullySaved = savedCount === totalAvailable && totalAvailable > 0;

    const localPlayableCount = currentVideos.filter((v) =>
      syncedVideoIds.has(v.id)
    ).length;
    const playableCount = serverUrl ? totalAvailable : localPlayableCount;

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

      // Save playlist metadata with all videos
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
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {/* Header with back button */}
        <View style={styles.videoHeader}>
          <Pressable style={styles.backButton} onPress={handleBackPress}>
            <ArrowLeft size={18} color={colors.foreground} />
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
                {isFullySaved ? "Saved" : "Save All"}
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

        {/* Action toolbar */}
        {(syncableCount > 0 || playableCount > 0) && (
          <View style={styles.toolbar}>
            {syncableCount > 0 && (
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
            )}
            {selectedVideoIds.size > 0 && (
              <Pressable style={styles.syncAllButton} onPress={handleSyncSelected}>
                <Text style={styles.syncAllButtonText}>
                  Sync {selectedVideoIds.size} video
                  {selectedVideoIds.size !== 1 ? "s" : ""}
                </Text>
              </Pressable>
            )}
            {playableCount > 0 && selectedVideoIds.size === 0 && (
              <Pressable style={styles.playAllButton} onPress={handlePlayAll}>
                <Play size={14} color={colors.foreground} fill={colors.foreground} />
                <Text style={styles.playAllButtonText}>
                  Play All ({playableCount})
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Video list */}
        {isLoadingVideos ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading videos...</Text>
          </View>
        ) : videosError ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>Failed to load videos</Text>
            <Text style={styles.errorDetail}>{videosError}</Text>
          </View>
        ) : currentVideos.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyListText}>No videos found</Text>
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
      </SafeAreaView>
    );
  }

  // Main browsing view with tabs
  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      {/* Connection header */}
      <View
        style={[
          styles.connectionHeader,
          !isConnected && styles.connectionHeaderOffline,
        ]}
      >
        <View style={styles.connectionInfo}>
          <View
            style={[
              styles.connectionDot,
              !isConnected && styles.connectionDotOffline,
            ]}
          />
          <Text style={styles.connectionText}>
            {isConnected
              ? `Connected to ${serverName || "Desktop"}`
              : "Offline mode (showing cached data)"}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {isConnected && (activeDownloads.length > 0 || queuedDownloads.length > 0) && (
            <View style={styles.downloadStatus}>
              {activeDownloads.length > 0 && (
                <Text style={styles.downloadStatusText}>
                  {activeDownloads.length}
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
          {isConnected ? (
            <Pressable style={styles.disconnectButton} onPress={disconnect}>
              <Text style={styles.disconnectButtonText}>Disconnect</Text>
            </Pressable>
          ) : (
            <Link href="/connect" asChild>
              <Pressable style={styles.reconnectButton}>
                <Text style={styles.reconnectButtonText}>Reconnect</Text>
              </Pressable>
            </Link>
          )}
        </View>
      </View>

      {/* Tab bar */}
      <SyncTabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab content */}
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
          favoritePlaylistIds={favoritePlaylistIds}
          onPlaylistPress={handlePlaylistPress}
          onSavePress={serverUrl ? handlePlaylistSavePress : undefined}
          onRefresh={handleRefreshPlaylists}
        />
      )}

      {activeTab === "subscriptions" && (
        <>
          {isLoadingSubscriptions && subscriptionVideos.length === 0 ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading subscriptions...</Text>
            </View>
          ) : subscriptionsError ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>Failed to load subscriptions</Text>
              <Text style={styles.errorDetail}>{subscriptionsError}</Text>
            </View>
          ) : subscriptionVideos.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyListText}>No subscription videos yet</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  loadingText: {
    color: colors.mutedForeground,
    fontSize: fontSize.base,
    marginTop: spacing.sm + 4,
  },
  errorText: {
    color: colors.destructive,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  errorDetail: {
    color: colors.mutedForeground,
    fontSize: 13,
    textAlign: "center",
  },
  emptyListText: {
    color: colors.foreground,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    color: colors.foreground,
    fontSize: fontSize["3xl"],
    fontWeight: fontWeight.bold,
    marginTop: spacing.md,
    marginBottom: spacing.sm + 4,
  },
  emptyText: {
    color: colors.mutedForeground,
    fontSize: fontSize.md,
    textAlign: "center",
    marginBottom: spacing.xl,
    lineHeight: 24,
  },
  connectButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  connectButtonText: {
    color: colors.primaryForeground,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  connectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  connectionHeaderOffline: {
    backgroundColor: colors.background,
  },
  connectionInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: spacing.sm,
  },
  connectionDotOffline: {
    backgroundColor: "#f59e0b",
  },
  connectionText: {
    color: colors.foreground,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
  },
  downloadStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  downloadStatusText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  queuedStatusText: {
    color: colors.mutedForeground,
    fontSize: fontSize.sm,
  },
  disconnectButton: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.muted,
  },
  disconnectButtonText: {
    color: colors.foreground,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  reconnectButton: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  reconnectButtonText: {
    color: colors.primaryForeground,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  videoHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.muted,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm + 4,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    color: colors.foreground,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  headerSubtitle: {
    color: colors.mutedForeground,
    fontSize: 13,
    marginTop: 2,
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.sm + 4,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toolbarButton: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
    borderRadius: 6,
    backgroundColor: colors.muted,
  },
  toolbarButtonText: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: fontWeight.medium,
  },
  syncAllButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  syncAllButtonText: {
    color: colors.primaryForeground,
    fontSize: 13,
    fontWeight: fontWeight.semibold,
  },
  playAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 6,
    backgroundColor: colors.success,
    marginLeft: "auto",
  },
  playAllButtonText: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: fontWeight.semibold,
  },
  gridList: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  gridRow: {
    justifyContent: "space-between",
  },
  videoList: {
    paddingVertical: spacing.sm,
  },
  saveOfflineButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  saveOfflineButtonDisabled: {
    backgroundColor: colors.success,
  },
  saveOfflineButtonText: {
    color: colors.primaryForeground,
    fontSize: 13,
    fontWeight: fontWeight.semibold,
  },
  progressContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.muted,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.success,
    borderRadius: 2,
  },
});
