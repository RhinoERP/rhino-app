"use client";

import { captureException } from "@sentry/nextjs";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { trackPwaEvent } from "@/lib/pwa-telemetry";

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PwaContextValue = {
  installPrompt: BeforeInstallPromptEvent | null;
  isInstalled: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
};

const PwaContext = createContext<PwaContextValue | null>(null);

export function PwaProvider({ children }: { children: ReactNode }) {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    setIsInstalled(window.matchMedia("(display-mode: standalone)").matches);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      trackPwaEvent("pwa.install_prompt_available");
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
      trackPwaEvent("pwa.app_installed");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!installPrompt) {
      return "unavailable" as const;
    }

    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      trackPwaEvent(
        outcome === "accepted"
          ? "pwa.install_prompt_accepted"
          : "pwa.install_prompt_dismissed"
      );
      setInstallPrompt(null);
      return outcome;
    } catch (error) {
      captureException(error, { tags: { feature: "pwa-install" } });
      return "unavailable" as const;
    }
  };

  return (
    <PwaContext.Provider value={{ installPrompt, isInstalled, promptInstall }}>
      {children}
    </PwaContext.Provider>
  );
}

export function usePwa() {
  const context = useContext(PwaContext);
  if (!context) {
    throw new Error("usePwa must be used within PwaProvider");
  }
  return context;
}
