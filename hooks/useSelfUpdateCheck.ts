import { useEffect } from "react";
import { checkForAndroidApkUpdate, shouldCheckForUpdatesOnLaunch } from "../services/app-update";

export function useSelfUpdateCheck() {
  useEffect(() => {
    if (!shouldCheckForUpdatesOnLaunch()) {
      return;
    }

    void checkForAndroidApkUpdate();
  }, []);
}
