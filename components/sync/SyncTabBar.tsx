import { useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import type { BrowseTab } from "../../types";
import { colors, radius, spacing, fontSize, fontWeight } from "../../theme";

interface SyncTabBarProps {
  activeTab: BrowseTab;
  onTabChange: (tab: BrowseTab) => void;
}

export function SyncTabBar({ activeTab, onTabChange }: SyncTabBarProps) {
  const isTv = Platform.isTV;
  const [focusedTab, setFocusedTab] = useState<BrowseTab | null>(null);

  const tabs: { key: BrowseTab; label: string }[] = [
    { key: "mylists", label: "My Lists" },
    { key: "channels", label: "Channels" },
    { key: "playlists", label: "Playlists" },
    { key: "subscriptions", label: "Subs" },
  ];

  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        const isFocused = focusedTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [
              styles.tab,
              isActive && styles.activeTab,
              isTv && isFocused && styles.focusedTab,
              pressed && styles.tabPressed,
            ]}
            onPress={() => onTabChange(tab.key)}
            focusable={isTv}
            hasTVPreferredFocus={isTv && isActive}
            onFocus={() => setFocusedTab(tab.key)}
            onBlur={() => setFocusedTab(null)}
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
  focusedTab: {
    borderBottomColor: colors.ring,
    backgroundColor: colors.cardHover,
    borderRadius: radius.md,
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
