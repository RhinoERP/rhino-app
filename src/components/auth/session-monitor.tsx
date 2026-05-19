"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  hasActiveBrowserSession,
  openLoginForCurrentPage,
} from "@/lib/supabase/session-client";

export const sessionExpiredToastId = "session-expired";
const sessionCheckIntervalMs = 5 * 60 * 1000;

export function SessionMonitor() {
  const pathname = usePathname();
  const checkingRef = useRef(false);
  const hasWarnedRef = useRef(false);

  const isAuthRoute = pathname?.startsWith("/auth");

  const showExpiredSessionWarning = useCallback(() => {
    if (hasWarnedRef.current) {
      return;
    }

    hasWarnedRef.current = true;
    toast.error("Tu sesión venció", {
      id: sessionExpiredToastId,
      description:
        "Podés seguir revisando lo cargado, pero reingresá antes de guardar.",
      duration: Number.POSITIVE_INFINITY,
      action: {
        label: "Reingresar",
        onClick: openLoginForCurrentPage,
      },
    });
  }, []);

  const checkSession = useCallback(async () => {
    if (isAuthRoute || checkingRef.current) {
      return;
    }

    checkingRef.current = true;

    try {
      if (!(await hasActiveBrowserSession())) {
        showExpiredSessionWarning();
        return;
      }

      hasWarnedRef.current = false;
      toast.dismiss(sessionExpiredToastId);
    } catch {
      showExpiredSessionWarning();
    } finally {
      checkingRef.current = false;
    }
  }, [isAuthRoute, showExpiredSessionWarning]);

  const scheduleSessionCheck = useCallback(() => {
    checkSession().catch(() => {
      showExpiredSessionWarning();
    });
  }, [checkSession, showExpiredSessionWarning]);

  useEffect(() => {
    if (isAuthRoute) {
      toast.dismiss(sessionExpiredToastId);
      return;
    }

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        showExpiredSessionWarning();
        return;
      }

      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        hasWarnedRef.current = false;
        toast.dismiss(sessionExpiredToastId);
      }
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleSessionCheck();
      }
    };

    const handleFocus = () => {
      scheduleSessionCheck();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    const intervalId = window.setInterval(
      scheduleSessionCheck,
      sessionCheckIntervalMs
    );

    scheduleSessionCheck();

    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.clearInterval(intervalId);
    };
  }, [isAuthRoute, scheduleSessionCheck, showExpiredSessionWarning]);

  return null;
}
