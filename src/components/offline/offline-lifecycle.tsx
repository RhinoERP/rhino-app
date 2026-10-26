"use client";

import { useEffect, useRef } from "react";
import {
  maintainOfflineDataForOwner,
  touchOfflineDataForOwner,
} from "@/modules/offline/storage/offline-db";

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

type OfflineLifecycleProps = {
  ownerUserId: string;
};

export function OfflineLifecycle({ ownerUserId }: OfflineLifecycleProps) {
  const lastTouchRef = useRef(0);

  useEffect(() => {
    let disposed = false;

    const maintainThenTouch = async () => {
      await maintainOfflineDataForOwner(ownerUserId);
      if (!disposed) {
        await touchOfflineDataForOwner(ownerUserId);
        lastTouchRef.current = Date.now();
      }
    };

    const touchIfNeeded = () => {
      if (Date.now() - lastTouchRef.current < TOUCH_INTERVAL_MS) {
        return;
      }
      touchOfflineDataForOwner(ownerUserId)
        .then(() => {
          lastTouchRef.current = Date.now();
        })
        .catch(() => null);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        maintainThenTouch().catch(() => null);
      }
    };

    maintainThenTouch().catch(() => null);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", touchIfNeeded);
    window.addEventListener("pointerdown", touchIfNeeded);
    window.addEventListener("keydown", touchIfNeeded);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", touchIfNeeded);
      window.removeEventListener("pointerdown", touchIfNeeded);
      window.removeEventListener("keydown", touchIfNeeded);
    };
  }, [ownerUserId]);

  return null;
}
