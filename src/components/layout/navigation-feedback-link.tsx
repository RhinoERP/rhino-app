"use client";

import type { ComponentProps, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type NavigationFeedbackLinkProps = Omit<
  ComponentProps<"a">,
  "children" | "href" | "onClick"
> & {
  children: ReactNode;
  href: string;
  pendingLabel: string;
  pendingClassName?: string;
};

export function NavigationFeedbackLink({
  children,
  className,
  href,
  pendingLabel,
  pendingClassName,
  ...props
}: NavigationFeedbackLinkProps) {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    // Safari can restore the previous page from its back/forward cache.
    const resetPending = () => setPending(false);
    window.addEventListener("pageshow", resetPending);
    return () => window.removeEventListener("pageshow", resetPending);
  }, []);

  return (
    <a
      {...props}
      aria-busy={pending || undefined}
      className={cn("relative", className)}
      href={href}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        if (pending) {
          return;
        }
        setPending(true);
        // Give the browser a frame to paint feedback before loading a slow page.
        window.setTimeout(() => window.location.assign(href), 80);
      }}
    >
      {children}
      {pending && (
        <span
          aria-live="polite"
          className={cn(
            "absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 rounded-md bg-background/95 px-1 text-center text-foreground text-xs",
            pendingClassName
          )}
        >
          <Spinner aria-label="Cargando" />
          {pendingLabel}
        </span>
      )}
    </a>
  );
}
