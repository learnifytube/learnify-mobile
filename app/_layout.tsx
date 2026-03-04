import { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useDownloadProcessor } from "../hooks/useDownloadProcessor";
import { useDatabase } from "../hooks/useDatabase";
import { useLibraryStore } from "../stores/library";
import { useNavigationLogger } from "../hooks/useNavigationLogger";
import { usePresencePublisher } from "../hooks/usePresencePublisher";
import { useSelfUpdateCheck } from "../hooks/useSelfUpdateCheck";
import { colors } from "../theme";
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://6228136d91b7bf22eacc61f6d89044c3@o1116636.ingest.us.sentry.io/4510819520675840',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

function DownloadProcessor() {
  useDownloadProcessor();
  return null;
}

function NavigationLogger() {
  useNavigationLogger();
  return null;
}

function PresencePublisher() {
  usePresencePublisher();
  return null;
}

function SelfUpdateChecker() {
  useSelfUpdateCheck();
  return null;
}

function DatabaseInitializer({ children }: { children: React.ReactNode }) {
  const { isReady, error } = useDatabase();
  const loadVideos = useLibraryStore((state) => state.loadVideos);
  const isLoaded = useLibraryStore((state) => state.isLoaded);

  useEffect(() => {
    if (isReady && !isLoaded) {
      loadVideos();
    }
  }, [isReady, isLoaded, loadVideos]);

  if (error) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>Database Error</Text>
        <Text style={styles.errorDetail}>{error.message}</Text>
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Initializing...</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 16,
    color: colors.mutedForeground,
    fontSize: 16,
  },
  errorText: {
    color: colors.destructive,
    fontSize: 18,
    fontWeight: "bold",
  },
  errorDetail: {
    color: colors.mutedForeground,
    fontSize: 14,
    marginTop: 8,
  },
});

export default Sentry.wrap(function RootLayout() {
  return (
    <SafeAreaProvider>
      <DatabaseInitializer>
        <DownloadProcessor />
        <NavigationLogger />
        <PresencePublisher />
        <SelfUpdateChecker />
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: colors.background,
            },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="player/[id]"
            options={{
              headerShown: false,
              presentation: "fullScreenModal",
            }}
          />
          <Stack.Screen
            name="share"
            options={{
              title: "Share",
              headerShown: false,
              presentation: "modal",
              headerStyle: {
                backgroundColor: colors.card,
              },
              headerTintColor: colors.foreground,
            }}
          />
          <Stack.Screen
            name="connect"
            options={{
              title: "Sync Videos",
              headerShown: false,
              presentation: "modal",
              headerStyle: {
                backgroundColor: colors.card,
              },
              headerTintColor: colors.foreground,
            }}
          />
          <Stack.Screen
            name="sync"
            options={{
              title: "Browse Server",
              headerShown: false,
              presentation: "modal",
              headerStyle: {
                backgroundColor: colors.card,
              },
              headerTintColor: colors.foreground,
            }}
          />
        </Stack>
      </DatabaseInitializer>
    </SafeAreaProvider>
  );
});
