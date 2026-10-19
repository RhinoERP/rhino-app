"use client";

import {
  DownloadSimpleIcon,
  ShareNetworkIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { usePermissions } from "@/components/auth/permissions-provider";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { getPwaInstallGuide } from "@/lib/pwa-install-guide";
import { trackPwaEvent } from "@/lib/pwa-telemetry";
import { usePwa } from "./pwa-provider";

const DISMISS_KEY = "rhinos:pwa-install-dismissed-at";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
function wasRecentlyDismissed() {
  const value = window.localStorage.getItem(DISMISS_KEY);
  if (!value) {
    return false;
  }
  return Date.now() - Number(value) < DISMISS_DURATION_MS;
}

export function PwaInstallBanner({
  wholesaleEnabled,
}: {
  wholesaleEnabled: boolean;
}) {
  const { can } = usePermissions();
  const isMobile = useIsMobile();
  const { installPrompt, isInstalled, promptInstall } = usePwa();
  const [dismissed, setDismissed] = useState(true);
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  const canManageSales = can("sales.manage") || can("sales.manage.all");
  const installGuide =
    typeof navigator === "undefined"
      ? null
      : getPwaInstallGuide(
          navigator.userAgent,
          navigator.platform,
          navigator.maxTouchPoints
        );
  const canOfferInstall = Boolean(installPrompt) || Boolean(installGuide);
  const shouldShow =
    isMobile &&
    wholesaleEnabled &&
    canManageSales &&
    canOfferInstall &&
    !isInstalled &&
    !dismissed;

  useEffect(() => {
    setDismissed(wasRecentlyDismissed());
  }, []);

  useEffect(() => {
    if (shouldShow) {
      trackPwaEvent("pwa.install_banner_shown");
    }
  }, [shouldShow]);

  if (!shouldShow) {
    return null;
  }

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
    trackPwaEvent("pwa.install_banner_dismissed");
  };

  const install = async () => {
    if (installPrompt) {
      const result = await promptInstall();
      if (result === "unavailable" && installGuide) {
        setShowInstallGuide(true);
      }
      return;
    }

    if (installGuide) {
      setShowInstallGuide(true);
      trackPwaEvent(
        installGuide.browser === "safari-ios"
          ? "pwa.ios_instructions_shown"
          : "pwa.browser_install_guide_shown"
      );
    }
  };

  return (
    <aside className="fixed right-3 bottom-20 left-3 z-50 mx-auto max-w-md rounded-xl border bg-background p-4 shadow-xl md:hidden">
      <button
        aria-label="Cerrar invitacion de instalacion"
        className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={dismiss}
        type="button"
      >
        <XIcon className="size-4" />
      </button>
      <div className="pr-6">
        <p className="font-semibold">Instala Rhinos</p>
        {showInstallGuide && installGuide ? (
          <div className="mt-1 text-muted-foreground text-sm">
            <p>Pasos para {installGuide.label}:</p>
            <ol className="mt-2 list-inside list-decimal space-y-1">
              {installGuide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="mt-1 text-muted-foreground text-sm">
            Accede mas rapido desde la pantalla de inicio de tu telefono.
          </p>
        )}
      </div>
      {!showInstallGuide && (
        <div className="mt-3 flex flex-col gap-2">
          <Button className="w-full" onClick={install} size="sm">
            {installPrompt ? <DownloadSimpleIcon /> : <ShareNetworkIcon />}
            {installPrompt
              ? "Instalar aplicacion"
              : "Ver tutorial de instalacion"}
          </Button>
          {installPrompt && installGuide && (
            <Button
              className="w-full"
              onClick={() => setShowInstallGuide(true)}
              size="sm"
              variant="outline"
            >
              Ver pasos en {installGuide.label}
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}
