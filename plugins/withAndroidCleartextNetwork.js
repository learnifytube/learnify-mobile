const fs = require("fs/promises");
const path = require("path");
const {
  withAndroidManifest,
  withDangerousMod,
} = require("@expo/config-plugins");

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`;

function withAndroidCleartextNetwork(config) {
  config = withAndroidManifest(config, (androidManifestConfig) => {
    const application =
      androidManifestConfig.modResults.manifest.application?.[0];
    if (!application) {
      return androidManifestConfig;
    }

    application.$ = application.$ || {};
    application.$["android:usesCleartextTraffic"] = "true";
    application.$["android:networkSecurityConfig"] =
      "@xml/network_security_config";

    return androidManifestConfig;
  });

  config = withDangerousMod(config, [
    "android",
    async (dangerousConfig) => {
      const xmlDir = path.join(
        dangerousConfig.modRequest.platformProjectRoot,
        "app/src/main/res/xml"
      );

      await fs.mkdir(xmlDir, { recursive: true });
      await fs.writeFile(
        path.join(xmlDir, "network_security_config.xml"),
        NETWORK_SECURITY_CONFIG,
        "utf8"
      );

      return dangerousConfig;
    },
  ]);

  return config;
}

module.exports = withAndroidCleartextNetwork;
