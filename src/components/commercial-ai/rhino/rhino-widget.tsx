"use client";

import {
  ArrowsOutSimpleIcon,
  ChartBarIcon,
  XIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { usePermissions } from "@/components/auth/permissions-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getRhinoWidgetAction,
  type RhinoWidgetInfo,
} from "@/modules/commercial-ai/actions/assistant.actions";
import { SUGGESTED_QUESTIONS } from "@/modules/commercial-ai/constants";
import { RhinoAvatar } from "./rhino-avatar";
import { RhinoChat } from "./rhino-chat";
import type { RhinoLinkHandler } from "./rhino-text";

const LINK_PARAM = {
  cli: "cliente",
  opp: "oportunidad",
  pro: "prospecto",
} as const;
const OPEN_KEY = "rhino-widget-open";
const HEADER_BUTTON =
  "size-7 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground";

function WidgetHeader({
  orgSlug,
  canReset,
  onReset,
  onClose,
}: {
  orgSlug: string;
  canReset: boolean;
  onReset: () => void;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const onCommercialAi = pathname.includes("/ia-comercial");
  return (
    <header className="flex items-center gap-2.5 border-b bg-primary px-4 py-3 text-primary-foreground">
      <RhinoAvatar size={32} />
      <div className="min-w-0 flex-1">
        <p className="font-heading font-semibold leading-tight">RHINO</p>
        <p className="truncate text-primary-foreground/75 text-xs">
          Tu asistente comercial · datos reales de Rhinos
        </p>
      </div>
      {canReset ? (
        <Button
          className={cn(HEADER_BUTTON, "w-auto px-2 text-xs")}
          onClick={onReset}
          size="sm"
          variant="ghost"
        >
          Nueva
        </Button>
      ) : null}
      {onCommercialAi ? null : (
        <Button
          asChild
          className={HEADER_BUTTON}
          size="icon"
          title="Abrir Reportes"
          variant="ghost"
        >
          <Link href={`/org/${orgSlug}/ia-comercial?seccion=reportes`}>
            <ChartBarIcon />
          </Link>
        </Button>
      )}
      <Button
        asChild
        className={cn(HEADER_BUTTON, "hidden md:inline-flex")}
        size="icon"
        title="Abrir en pantalla completa"
        variant="ghost"
      >
        <Link
          href={`/org/${orgSlug}/ia-comercial?seccion=rhino`}
          onClick={onClose}
        >
          <ArrowsOutSimpleIcon />
        </Link>
      </Button>
      <Button
        aria-label="Cerrar"
        className={HEADER_BUTTON}
        onClick={onClose}
        size="icon"
        variant="ghost"
      >
        <XIcon />
      </Button>
    </header>
  );
}

/** Abierta o cerrada se recuerda mientras dure la pestaña del navegador. */
function useRememberedOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(sessionStorage.getItem(OPEN_KEY) === "1");
    } catch {
      // Sin almacenamiento: arranca cerrada.
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      // Ignorar.
    }
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return [open, setOpen] as const;
}

/**
 * RHINO en cualquier módulo: una burbuja abajo a la derecha que abre el chat
 * sin salir de la pantalla donde estás.
 */
export function RhinoWidget({
  orgSlug,
  userId,
}: {
  orgSlug: string;
  userId: string;
}) {
  const { can } = usePermissions();
  const router = useRouter();
  const [open, setOpen] = useRememberedOpen();
  const [info, setInfo] = useState<RhinoWidgetInfo | null>(null);
  const [chat, setChat] = useState<{ count: number; reset: () => void }>({
    count: 0,
    reset: () => null,
  });
  const allowed = can("commercial_ai.read") || can("commercial_ai.manage");

  useEffect(() => {
    if (open && !info) {
      getRhinoWidgetAction(orgSlug).then(setInfo);
    }
  }, [open, info, orgSlug]);

  const onMessagesChange = useCallback(
    (count: number, reset: () => void) => setChat({ count, reset }),
    []
  );

  if (!(allowed && userId)) {
    return null;
  }

  const onLink: RhinoLinkHandler = (kind, id) => {
    router.push(
      `/org/${orgSlug}/ia-comercial?${LINK_PARAM[kind]}=${encodeURIComponent(id)}`
    );
    if (window.matchMedia("(max-width: 767px)").matches) {
      setOpen(false);
    }
  };

  return (
    <>
      {open ? (
        <section
          aria-label="Chat con RHINO"
          className="fixed inset-x-0 bottom-0 z-[60] flex h-[85dvh] flex-col overflow-hidden rounded-t-2xl border bg-background shadow-2xl md:inset-x-auto md:right-5 md:bottom-24 md:h-[min(640px,calc(100dvh-8rem))] md:w-[400px] md:rounded-2xl print:hidden"
        >
          <WidgetHeader
            canReset={chat.count > 0}
            onClose={() => setOpen(false)}
            onReset={chat.reset}
            orgSlug={orgSlug}
          />
          {info?.enabled ? (
            <RhinoChat
              aiEnabled={info.aiEnabled}
              compact
              isManager={info.isManager}
              onLink={onLink}
              onMessagesChange={onMessagesChange}
              orgSlug={orgSlug}
              suggestions={
                SUGGESTED_QUESTIONS[info.isManager ? "gerente" : "vendedor"]
              }
              userId={userId}
            />
          ) : (
            <div className="m-auto p-6 text-center text-muted-foreground text-sm">
              {info ? "No tenés acceso a IA Comercial." : "Abriendo RHINO…"}
            </div>
          )}
        </section>
      ) : null}

      <button
        aria-expanded={open}
        aria-label={open ? "Cerrar RHINO" : "Abrir RHINO, tu asistente"}
        className={cn(
          "group fixed right-4 bottom-20 z-[60] flex items-center gap-2 rounded-full bg-primary p-1.5 text-primary-foreground shadow-lg ring-4 ring-primary/15 transition-all hover:shadow-xl md:right-5 md:bottom-5 print:hidden",
          open && "max-md:hidden"
        )}
        onClick={() => setOpen((v) => !v)}
        title="RHINO"
        type="button"
      >
        <RhinoAvatar size={40} />
        <span className="hidden pr-2 font-heading font-semibold text-sm tracking-wide md:group-hover:inline">
          {open ? "Cerrar" : "RHINO"}
        </span>
      </button>
    </>
  );
}
