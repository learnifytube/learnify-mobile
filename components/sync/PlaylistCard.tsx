import { useState } from "react";
import { View, Text, Pressable, Image, StyleSheet, Platform } from "react-native";
import type { RemotePlaylist } from "../../types";
import { api } from "../../services/api";
import { colors, radius, spacing, fontSize, fontWeight } from "../../theme";
import { ListVideo, Folder, Heart } from "../../theme/icons";

interface PlaylistCardProps {
  playlist: RemotePlaylist;
  serverUrl?: string;
  isFavorited?: boolean;
  onPress: () => void;
  onSavePress?: () => void;
  hasTVPreferredFocus?: boolean;
}

export function PlaylistCard({
  playlist,
  serverUrl,
  isFavorited = false,
  onPress,
  onSavePress,
  hasTVPreferredFocus = false,
}: PlaylistCardProps) {
  const isTv = Platform.isTV;
  const [isFocused, setIsFocused] = useState(false);
  const itemCount = playlist.itemCount ?? 0;
  const [imageError, setImageError] = useState(false);

  // Determine the thumbnail URL to use
  const getThumbnailUrl = () => {
    if (playlist.thumbnailUrl) {
      return playlist.thumbnailUrl;
    }
    // Fall back to constructing URL from server if available
    if (serverUrl && playlist.type === "channel") {
      return api.getPlaylistThumbnailUrl(serverUrl, playlist.playlistId);
    }
    return null;
  };

  const thumbnailUrl = getThumbnailUrl();
  const showImage = thumbnailUrl && !imageError;

  return (
    <Pressable
      style={[
        styles.container,
        isTv && isFocused && styles.containerFocused,
      ]}
      onPress={onPress}
      focusable={isTv}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    >
      <View style={styles.thumbnailContainer}>
        {showImage ? (
          <Image
            source={{ uri: thumbnailUrl }}
            style={styles.thumbnail}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
            {playlist.type === "custom" ? (
              <ListVideo size={20} color={colors.mutedForeground} />
            ) : (
              <Folder size={20} color={colors.mutedForeground} />
            )}
          </View>
        )}
        {itemCount > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{itemCount}</Text>
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {playlist.title}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.type}>
            {playlist.type === "custom" ? "Custom" : "Channel"}
          </Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.downloaded}>
            {playlist.downloadedCount}/{itemCount} downloaded
          </Text>
        </View>
      </View>
      {onSavePress && (
        <Pressable style={styles.saveButton} onPress={onSavePress} focusable={!isTv}>
          <Heart
            size={20}
            color={isFavorited ? colors.destructive : colors.mutedForeground}
            fill={isFavorited ? colors.destructive : "none"}
          />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    padding: spacing.sm + 4,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    marginHorizontal: spacing.md,
    marginVertical: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  containerFocused: {
    borderColor: colors.ring,
    backgroundColor: colors.cardHover,
    shadowColor: colors.ring,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  thumbnailContainer: {
    width: 80,
    height: 45,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: colors.muted,
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  thumbnailPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  countBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    backgroundColor: colors.overlay,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  countText: {
    color: colors.foreground,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  info: {
    flex: 1,
    marginLeft: spacing.sm + 4,
  },
  title: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: fontWeight.semibold,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  type: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  dot: {
    color: colors.textTertiary,
    marginHorizontal: 6,
  },
  downloaded: {
    color: colors.mutedForeground,
    fontSize: fontSize.sm,
  },
  saveButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: spacing.sm,
  },
});
