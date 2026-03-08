import { useEffect, useState, type Ref } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type ImageSourcePropType,
} from "react-native";
import {
  TVFocusPressable,
  type TVFocusPressableHandle,
} from "./TVFocusPressable";

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
  pressableRef?: Ref<TVFocusPressableHandle>;
  nextFocusLeft?: number;
  nextFocusRight?: number;
  nextFocusUp?: number;
  nextFocusDown?: number;
}

export function TVCard({
  title,
  subtitle,
  thumbnailUrl,
  onPress,
  onFocus,
  hasTVPreferredFocus,
  style,
  pressableRef,
  nextFocusLeft,
  nextFocusRight,
  nextFocusUp,
  nextFocusDown,
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
      ref={pressableRef}
      style={[styles.card, style]}
      focusedStyle={styles.cardFocused}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={onFocus}
      onPress={onPress}
      nextFocusLeft={nextFocusLeft}
      nextFocusRight={nextFocusRight}
      nextFocusUp={nextFocusUp}
      nextFocusDown={nextFocusDown}
    >
      <Image
        source={imageSource}
        style={styles.thumbnail}
        resizeMode="cover"
        onError={() => setThumbnailError(true)}
      />
      <View style={styles.scrim} />
      <View style={styles.bottomScrim} />
      <View style={styles.cardInner}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <View style={styles.subtitleBadge}>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
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
    backgroundColor: "rgba(6, 12, 24, 0.28)",
  },
  bottomScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    top: "38%",
    backgroundColor: "rgba(6, 12, 24, 0.76)",
  },
  cardFocused: {
    borderColor: "#ffd93d",
    shadowColor: "#ffd93d",
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 12,
    transform: [{ scale: 1.02 }],
  },
  cardInner: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 10,
  },
  title: {
    color: "#ffffff",
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
    textShadowColor: "rgba(0,0,0,0.65)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitleBadge: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(19, 36, 71, 0.72)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  subtitle: {
    color: "#eef6ff",
    fontSize: 15,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.65)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
