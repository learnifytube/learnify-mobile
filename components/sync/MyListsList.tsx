import { View, Text, FlatList, ActivityIndicator, StyleSheet } from "react-native";
import type { RemoteMyList } from "../../types";
import { MyListCard } from "./MyListCard";

interface MyListsListProps {
  myLists: RemoteMyList[];
  isLoading: boolean;
  error: string | null;
  onMyListPress: (myList: RemoteMyList) => void;
  onRefresh: () => void;
}

export function MyListsList({
  myLists,
  isLoading,
  error,
  onMyListPress,
  onRefresh,
}: MyListsListProps) {
  if (isLoading && myLists.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#e94560" />
        <Text style={styles.loadingText}>Loading your lists...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load lists</Text>
        <Text style={styles.errorDetail}>{error}</Text>
      </View>
    );
  }

  if (myLists.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No lists yet</Text>
        <Text style={styles.emptySubtext}>
          Create custom lists in the desktop app to organize your videos
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.flexList}
      data={myLists}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <MyListCard myList={item} onPress={() => onMyListPress(item)} />
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
