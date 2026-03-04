const fs = require("fs/promises");
const path = require("path");
const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
} = require("@expo/config-plugins");

const PLUGIN_NAME = "with-android-tv-support";
const PLUGIN_VERSION = "1.0.0";
const DEFAULT_BANNER_ASSET_PATH = "./assets/tv-banner.png";
const DEFAULT_BANNER_RESOURCE_NAME = "tv_banner";
const MAIN_ACTION_NAME = "android.intent.action.MAIN";
const LEANBACK_CATEGORY_NAME = "android.intent.category.LEANBACK_LAUNCHER";
const SUPPORTED_BANNER_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

function ensureUsesFeature(androidManifest, featureName, required) {
  const manifest = androidManifest.manifest;
  manifest["uses-feature"] = manifest["uses-feature"] || [];

  const existingFeature = manifest["uses-feature"].find(
    (feature) => feature.$?.["android:name"] === featureName
  );

  if (existingFeature) {
    existingFeature.$ = existingFeature.$ || {};
    existingFeature.$["android:name"] = featureName;
    existingFeature.$["android:required"] = required;
    return;
  }

  manifest["uses-feature"].push({
    $: {
      "android:name": featureName,
      "android:required": required,
    },
  });
}

function ensureLeanbackLauncherCategory(mainActivity) {
  mainActivity["intent-filter"] = mainActivity["intent-filter"] || [];

  let mainIntentFilter = mainActivity["intent-filter"].find((intentFilter) =>
    intentFilter.action?.some(
      (action) => action.$?.["android:name"] === MAIN_ACTION_NAME
    )
  );

  if (!mainIntentFilter) {
    mainIntentFilter = {
      action: [{ $: { "android:name": MAIN_ACTION_NAME } }],
      category: [],
    };
    mainActivity["intent-filter"].push(mainIntentFilter);
  }

  mainIntentFilter.category = mainIntentFilter.category || [];

  const hasLeanbackCategory = mainIntentFilter.category.some(
    (category) => category.$?.["android:name"] === LEANBACK_CATEGORY_NAME
  );

  if (!hasLeanbackCategory) {
    mainIntentFilter.category.push({
      $: { "android:name": LEANBACK_CATEGORY_NAME },
    });
  }
}

function resolveBannerAssetPath(config, props) {
  const candidatePath =
    props.banner ||
    config.android?.tvBanner ||
    DEFAULT_BANNER_ASSET_PATH;

  if (/^[a-z]+:\/\//i.test(candidatePath)) {
    throw new Error(
      `[${PLUGIN_NAME}] Android TV banner must be a local file path, received: ${candidatePath}`
    );
  }

  return candidatePath;
}

function getBannerResourceName(props) {
  const customName = props.bannerResourceName;
  return typeof customName === "string" && customName.trim()
    ? customName.trim()
    : DEFAULT_BANNER_RESOURCE_NAME;
}

async function deleteIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

const withAndroidTvSupport = (config, props = {}) => {
  const bannerResourceName = getBannerResourceName(props);

  config = withAndroidManifest(config, (manifestConfig) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(
      manifestConfig.modResults
    );
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      manifestConfig.modResults
    );

    ensureLeanbackLauncherCategory(mainActivity);
    ensureUsesFeature(
      manifestConfig.modResults,
      "android.software.leanback",
      "false"
    );
    ensureUsesFeature(
      manifestConfig.modResults,
      "android.hardware.touchscreen",
      "false"
    );

    application.$ = application.$ || {};
    application.$["android:banner"] = `@drawable/${bannerResourceName}`;

    return manifestConfig;
  });

  config = withDangerousMod(config, [
    "android",
    async (dangerousConfig) => {
      const projectRoot = dangerousConfig.modRequest.projectRoot;
      const bannerAssetPath = resolveBannerAssetPath(config, props);
      const sourcePath = path.resolve(projectRoot, bannerAssetPath);

      await fs.access(sourcePath);

      const extension = path.extname(sourcePath).toLowerCase();
      if (!SUPPORTED_BANNER_EXTENSIONS.includes(extension)) {
        throw new Error(
          `[${PLUGIN_NAME}] Unsupported banner extension "${extension}". Use one of: ${SUPPORTED_BANNER_EXTENSIONS.join(
            ", "
          )}`
        );
      }

      const drawableDir = path.join(
        dangerousConfig.modRequest.platformProjectRoot,
        "app/src/main/res/drawable-nodpi"
      );

      await fs.mkdir(drawableDir, { recursive: true });

      // Prevent duplicate Android resource names when the source extension changes.
      await Promise.all(
        SUPPORTED_BANNER_EXTENSIONS.filter((item) => item !== extension).map(
          (item) =>
            deleteIfExists(path.join(drawableDir, `${bannerResourceName}${item}`))
        )
      );

      await fs.copyFile(
        sourcePath,
        path.join(drawableDir, `${bannerResourceName}${extension}`)
      );

      return dangerousConfig;
    },
  ]);

  return config;
};

module.exports = createRunOncePlugin(
  withAndroidTvSupport,
  PLUGIN_NAME,
  PLUGIN_VERSION
);
