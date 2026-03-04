const {
  wrapWithReanimatedMetroConfig,
} = require("react-native-reanimated/metro-config");
const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// Resolve react-dom/client to empty module for native builds
// This fixes the @expo/log-box incorrectly importing web dependencies
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === "android" &&
    moduleName === "react-dom/client"
  ) {
    return {
      type: "empty",
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = wrapWithReanimatedMetroConfig(config);
