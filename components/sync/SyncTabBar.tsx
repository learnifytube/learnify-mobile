import { View,
  Text,
  StyleSheet,
  Pressable,
} from "react-native";
import type { BrowseTab } from "../../types";
import { colors, spacing, fontSize, fontWeight } from "../../theme";

const DEFAULT_TABS: { key: BrowseTab; label: string }[] = [
  { key: "mylists", label: "My Lists" },
  { key: "channels", label: "Channels" },
  { key: "playlists", label: "Playlists" },
];

interface SyncTabBarProps {
  activeTab: BrowseTab;
  onTabChange: (tab: BrowseTab) => void;
  /** Restrict to a subset of tabs (e.g. ["mylists", "playlists"] for Library screen). */
  tabs?: { key: BrowseTab; label: string }[];
}

export function SyncTabBar({ activeTab, onTabChange, tabs = DEFAULT_TABS }: SyncTabBarProps) {

  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [
              styles.tab,
              isActive && styles.activeTab,
              pressed && styles.tabPressed,
            ]}
            onPress={() => onTabChange(tab.key)}
          >
            <Text style={[styles.tabText, isActive && styles.activeTabText]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomColor: colors.primary,
  },
  tabPressed: {
    opacity: 0.9,
  },
  tabText: {
    color: colors.textTertiary,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  activeTabText: {
    color: colors.foreground,
  },
});
