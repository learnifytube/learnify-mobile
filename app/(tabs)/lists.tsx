import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ScrollView,
  Image,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLibraryStore } from "../../stores/library";
import { useDownloadStore } from "../../stores/downloads";
import { VideoCard } from "../../components/VideoCard";
import { getAllSavedPlaylistsWithProgress } from "../../db/repositories/playlists";

type SavedPlaylistInfo = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  type: string;
  downloadedCount: number;
  totalCount: number;
};

export default function ListsScreen() {
  const router = useRouter();
  const videos = useLibraryStore((state) => state.videos);
  const downloadQueue = useDownloadStore((state) => state.queue);
  const [savedPlaylists, setSavedPlaylists] = useState<SavedPlaylistInfo[]>([]);

  // Load saved playlists
  useEffect(() => {
    const playlists = getAllSavedPlaylistsWithProgress();
    setSavedPlaylists(playlists);
  }, [videos]); // Re-fetch when videos change (download progress updates)

  const downloadedVideos = videos.filter((v) => !!v.localPath);
  const activeDownloads = downloadQueue.filter(
    (d) => d.status === "downloading"
  );
  const queuedDownloads = downloadQueue.filter((d) => d.status === "queued");

  const handlePlaylistPress = (playlistId: string) => {
    router.push(`/saved-playlist/${playlistId}`);
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
            <Pressable style={styles.syncButton}>
              <Text style={styles.syncButtonText}>Sync Videos</Text>
            </Pressable>
          </Link>
        </View>
      ) : (
        <ScrollView style={styles.scrollView}>
          {/* Saved Playlists Section */}
          {savedPlaylists.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Saved Playlists</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.playlistsRow}
              >
                {savedPlaylists.map((playlist) => (
                  <Pressable
                    key={playlist.id}
                    style={styles.playlistCard}
                    onPress={() => handlePlaylistPress(playlist.id)}
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
                          <Text style={styles.playlistPlaceholderText}>
                            {playlist.title.charAt(0)}
                          </Text>
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
                ))}
              </ScrollView>
            </View>
          )}

          {/* Download Status */}
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
                      {activeDownloads[0] &&
                        ` (${activeDownloads[0].progress}%)`}
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

          {/* All Videos Grid */}
          {videos.length > 0 && (
            <View style={styles.videosGrid}>
              {videos.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  style={styles.downloadedVideoCard}
                />
              ))}
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
    backgroundColor: "#09090b",
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingTop: 16,
  },
  sectionTitle: {
    color: "#fafafa",
    fontSize: 18,
    fontWeight: "600",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  playlistsRow: {
    paddingHorizontal: 12,
    gap: 12,
  },
  playlistCard: {
    width: 140,
    backgroundColor: "#18181b",
    borderRadius: 12,
    padding: 12,
  },
  playlistThumbnail: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#27272a",
    marginBottom: 8,
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
    backgroundColor: "#6366f1",
  },
  playlistPlaceholderText: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "700",
  },
  playlistTitle: {
    color: "#fafafa",
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 8,
  },
  playlistProgress: {
    gap: 4,
  },
  playlistProgressBar: {
    height: 3,
    backgroundColor: "#27272a",
    borderRadius: 1.5,
    overflow: "hidden",
  },
  playlistProgressFill: {
    height: "100%",
    backgroundColor: "#22c55e",
  },
  playlistProgressText: {
    color: "#71717a",
    fontSize: 11,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  headerInfo: {
    flex: 1,
  },
  headerText: {
    color: "#71717a",
    fontSize: 14,
  },
  downloadStatus: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  downloadStatusText: {
    color: "#6366f1",
    fontSize: 12,
    fontWeight: "500",
  },
  queuedStatusText: {
    color: "#71717a",
    fontSize: 12,
  },
  videosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 10,
    paddingTop: 8,
    justifyContent: "space-between",
  },
  downloadedVideoCard: {
    flex: 0,
    width: "48%",
    maxWidth: "48%",
    margin: 0,
    marginBottom: 10,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    color: "#fafafa",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  emptyText: {
    color: "#71717a",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
  },
  syncButton: {
    backgroundColor: "#6366f1",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  syncButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
