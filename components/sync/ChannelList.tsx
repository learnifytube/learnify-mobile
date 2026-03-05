import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import type { RemoteChannel } from "../../types";
import { ChannelCard } from "./ChannelCard";

interface ChannelListProps {
  channels: RemoteChannel[];
  isLoading: boolean;
  error: string | null;
  onChannelPress: (channel: RemoteChannel) => void;
  onRefresh: () => void;
}

export function ChannelList({
  channels,
  isLoading,
  error,
  onChannelPress,
  onRefresh,
}: ChannelListProps) {
  const isTv = Platform.isTV;

  if (isLoading && channels.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading channels...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load channels</Text>
        <Text style={styles.errorDetail}>{error}</Text>
      </View>
    );
  }

  if (channels.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No channels found</Text>
        <Text style={styles.emptySubtext}>
          Download videos in the desktop app to see channels here
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.flexList}
      data={channels}
      keyExtractor={(item) => item.channelId}
      numColumns={2}
      columnWrapperStyle={styles.row}
      renderItem={({ item, index }) => (
        <ChannelCard
          channel={item}
          onPress={() => onChannelPress(item)}
          hasTVPreferredFocus={isTv && index === 0}
        />
      )}
      contentContainerStyle={styles.list}
      refreshing={isLoading}
      onRefresh={onRefresh}
      showsVerticalScrollIndicator={false}
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
    marginBottom: 8,
  },
  emptySubtext: {
    color: "#71717a",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  list: {
    padding: 16,
    paddingBottom: 32,
  },
  row: {
    justifyContent: "space-between",
    marginBottom: 12,
  },
});
