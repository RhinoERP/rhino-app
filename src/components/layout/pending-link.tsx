"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

function PendingIndicator({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <output className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-md bg-background/95 px-1 text-center text-foreground text-xs">
      <Spinner aria-label="Cargando" />
      {label}
    </output>
  ) : null;
}

export function PendingLink({
  children,
  className,
  pendingLabel = "Abriendo…",
  ...props
}: ComponentProps<typeof Link> & {
  children: ReactNode;
  pendingLabel?: string;
}) {
  return (
    <Link className={cn("relative", className)} {...props}>
      <PendingIndicator label={pendingLabel} />
      {children}
    </Link>
  );
}
