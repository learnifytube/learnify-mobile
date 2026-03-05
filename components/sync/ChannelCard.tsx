import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Platform,
} from "react-native";
import type { RemoteChannel } from "../../types";
import {
  colors,
  radius,
  spacing,
  fontSize,
  fontWeight,
  getPlaceholderColor,
} from "../../theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_GAP = 12;
const CARD_PADDING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_PADDING * 2 - CARD_GAP) / 2;

interface ChannelCardProps {
  channel: RemoteChannel;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}

function formatLastUpdated(dateStr?: string | null) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

export function ChannelCard({
  channel,
  onPress,
  hasTVPreferredFocus = false,
}: ChannelCardProps) {
  const isTv = Platform.isTV;
  const [isFocused, setIsFocused] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const lastUpdated = formatLastUpdated(channel.lastUpdatedAt);
  const placeholderColor = getPlaceholderColor(channel.channelTitle);

  const hasValidUrl = channel.thumbnailUrl && channel.thumbnailUrl.length > 0;
  const showImage = hasValidUrl && !imageError;
  const showPlaceholder = !hasValidUrl || imageError || !imageLoaded;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        isTv && isFocused && styles.focused,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      focusable={isTv}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    >
      <View style={styles.thumbnailContainer}>
        {/* Always render placeholder behind image */}
        {showPlaceholder && (
          <View
            style={[
              styles.thumbnail,
              styles.thumbnailPlaceholder,
              { backgroundColor: placeholderColor },
            ]}
          >
            {hasValidUrl && !imageError && !imageLoaded ? (
              <ActivityIndicator size="small" color={colors.foreground} />
            ) : (
              <Text style={styles.placeholderText}>
                {channel.channelTitle.charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
        )}

        {/* Overlay image on top when it loads */}
        {showImage && (
          <Image
            source={{ uri: channel.thumbnailUrl! }}
            style={[styles.thumbnail, styles.absoluteFill]}
            resizeMode="cover"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {channel.channelTitle}
        </Text>

        <View style={styles.meta}>
          <Text style={styles.videoCount}>
            {channel.videoCount} video{channel.videoCount !== 1 ? "s" : ""}
          </Text>
          {lastUpdated && (
            <>
              <View style={styles.dot} />
              <Text style={styles.lastUpdated}>{lastUpdated}</Text>
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const AVATAR_SIZE = 72;

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.muted,
    transform: [{ scale: 0.98 }],
  },
  focused: {
    borderColor: colors.ring,
    backgroundColor: colors.cardHover,
    shadowColor: colors.ring,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  thumbnailContainer: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.muted,
    overflow: "hidden",
    marginBottom: spacing.sm + 4,
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  absoluteFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  thumbnailPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: colors.foreground,
    fontSize: 28,
    fontWeight: fontWeight.bold,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  info: {
    alignItems: "center",
  },
  title: {
    color: colors.foreground,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    lineHeight: 18,
    marginBottom: 4,
    textAlign: "center",
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
  },
  videoCount: {
    color: colors.textTertiary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.textTertiary,
    marginHorizontal: 6,
  },
  lastUpdated: {
    color: colors.textTertiary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
});
