import { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type ImageSourcePropType,
} from "react-native";
import { TVFocusPressable } from "./TVFocusPressable";

export const TV_GRID_CARD_WIDTH = 372;
export const TV_GRID_CARD_HEIGHT = 184;
const FALLBACK_THUMBNAIL = require("../../assets/tv-banner.png");

interface TVCardProps {
  title: string;
  subtitle?: string;
  thumbnailUrl?: string | null;
  onPress?: () => void;
  onFocus?: () => void;
  hasTVPreferredFocus?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function TVCard({
  title,
  subtitle,
  thumbnailUrl,
  onPress,
  onFocus,
  hasTVPreferredFocus,
  style,
}: TVCardProps) {
  const [thumbnailError, setThumbnailError] = useState(false);

  useEffect(() => {
    setThumbnailError(false);
  }, [thumbnailUrl]);

  const imageSource: ImageSourcePropType =
    thumbnailUrl && !thumbnailError
      ? { uri: thumbnailUrl }
      : FALLBACK_THUMBNAIL;

  return (
    <TVFocusPressable
      style={({ focused }) => [styles.card, focused && styles.cardFocused, style]}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={onFocus}
      onPress={onPress}
    >
      <Image
        source={imageSource}
        style={styles.thumbnail}
        resizeMode="cover"
        onError={() => setThumbnailError(true)}
      />
      <View style={styles.scrim} />
      <View style={styles.cardInner}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </TVFocusPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: TV_GRID_CARD_WIDTH,
    height: TV_GRID_CARD_HEIGHT,
    borderRadius: 24,
    backgroundColor: "#1a2443",
    borderWidth: 2,
    borderColor: "#8ec5ff",
    overflow: "hidden",
  },
  thumbnail: {
    ...StyleSheet.absoluteFillObject,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 18, 35, 0.55)",
  },
  cardFocused: {
    borderColor: "#ffd93d",
    transform: [{ scale: 1.02 }],
  },
  cardInner: {
    paddingHorizontal: 22,
    paddingVertical: 18,
    gap: 7,
  },
  title: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "800",
    textShadowColor: "rgba(0,0,0,0.65)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    color: "#eef6ff",
    fontSize: 17,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.65)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
