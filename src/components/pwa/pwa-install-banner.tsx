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
import { trackPwaEvent } from "@/lib/pwa-telemetry";
import { usePwa } from "./pwa-provider";

const DISMISS_KEY = "rhinos:pwa-install-dismissed-at";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const IOS_USER_AGENT = /iPad|iPhone|iPod/;

function isIos() {
  return IOS_USER_AGENT.test(navigator.userAgent);
}

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
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  const canManageSales = can("sales.manage") || can("sales.manage.all");
  const ios = typeof navigator !== "undefined" && isIos();
  const canOfferInstall = Boolean(installPrompt) || ios;
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
    if (ios) {
      setShowIosInstructions(true);
      trackPwaEvent("pwa.ios_instructions_shown");
      return;
    }
    await promptInstall();
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
        {showIosInstructions ? (
          <p className="mt-1 text-muted-foreground text-sm">
            Toca Compartir en Safari y luego “Agregar a inicio”.
          </p>
        ) : (
          <p className="mt-1 text-muted-foreground text-sm">
            Accede mas rapido desde la pantalla de inicio de tu telefono.
          </p>
        )}
      </div>
      {!showIosInstructions && (
        <Button className="mt-3 w-full" onClick={install} size="sm">
          {ios ? <ShareNetworkIcon /> : <DownloadSimpleIcon />}
          {ios ? "Ver como instalar" : "Instalar aplicacion"}
        </Button>
      )}
    </aside>
  );
}
