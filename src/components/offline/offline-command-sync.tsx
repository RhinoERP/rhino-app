"use client";

import { useEffect } from "react";
import { replayOfflineCommands } from "@/modules/offline/sync/offline-command-sync";

export function OfflineCommandSync() {
  useEffect(() => {
    const replay = () => {
      replayOfflineCommands().catch(() => null);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        replay();
      }
    };

    replay();
    const interval = window.setInterval(replay, 30_000);
    window.addEventListener("online", replay);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", replay);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
