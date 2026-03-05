import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import type { RemotePlaylist } from "../../types";
import { PlaylistCard } from "./PlaylistCard";

interface PlaylistListProps {
  playlists: RemotePlaylist[];
  isLoading: boolean;
  error: string | null;
  serverUrl?: string;
  favoritePlaylistIds?: Set<string>;
  onPlaylistPress: (playlist: RemotePlaylist) => void;
  onSavePress?: (playlist: RemotePlaylist) => void;
  onRefresh: () => void;
}

export function PlaylistList({
  playlists,
  isLoading,
  error,
  serverUrl,
  favoritePlaylistIds,
  onPlaylistPress,
  onSavePress,
  onRefresh,
}: PlaylistListProps) {
  const isTv = Platform.isTV;

  if (isLoading && playlists.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#e94560" />
        <Text style={styles.loadingText}>Loading playlists...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load playlists</Text>
        <Text style={styles.errorDetail}>{error}</Text>
      </View>
    );
  }

  if (playlists.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No playlists found</Text>
        <Text style={styles.emptySubtext}>
          Create playlists in the desktop app to see them here
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.flexList}
      data={playlists}
      keyExtractor={(item) => item.playlistId}
      renderItem={({ item, index }) => (
        <PlaylistCard
          playlist={item}
          serverUrl={serverUrl}
          isFavorited={favoritePlaylistIds?.has(item.playlistId)}
          onPress={() => onPlaylistPress(item)}
          onSavePress={onSavePress ? () => onSavePress(item) : undefined}
          hasTVPreferredFocus={isTv && index === 0}
        />
      )}
      contentContainerStyle={styles.list}
      refreshing={isLoading}
      onRefresh={onRefresh}
    />
  );
}

const styles = StyleSheet.create({
  flexList: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  loadingText: {
    color: "#888",
    fontSize: 14,
    marginTop: 12,
  },
  errorText: {
    color: "#e94560",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  errorDetail: {
    color: "#888",
    fontSize: 13,
    textAlign: "center",
  },
  emptyText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptySubtext: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
  },
  list: {
    paddingVertical: 8,
  },
});
