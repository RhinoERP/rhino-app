"use client";

import { useEffect } from "react";
import { maintainOfflineDataForOwner } from "@/modules/offline/storage/offline-db";
import { replayOfflineCommands } from "@/modules/offline/sync/offline-command-sync";

export function OfflineCommandSync({ ownerUserId }: { ownerUserId: string }) {
  useEffect(() => {
    const replay = () => {
      replayOfflineCommands(ownerUserId).catch(() => null);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        replay();
      }
    };

    maintainOfflineDataForOwner(ownerUserId)
      .then(replay)
      .catch(() => null);
    const interval = window.setInterval(replay, 30_000);
    window.addEventListener("online", replay);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", replay);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [ownerUserId]);

  return null;
}
