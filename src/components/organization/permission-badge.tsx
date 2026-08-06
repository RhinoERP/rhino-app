"use client";

import { CheckIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type PermissionBadgeProps = {
  id: string;
  label: string;
  tooltip?: string;
  selected?: boolean;
  onClick?: (id: string) => void;
  scope?: "own" | "all";
};

function ScopeChip({ scope }: { scope: "own" | "all" }) {
  if (scope === "own") {
    return (
      <span className="ml-1 rounded bg-primary/20 px-1.5 py-0.5 font-medium text-[10px] leading-none">
        Propio
      </span>
    );
  }
  return (
    <span className="ml-1 rounded bg-secondary px-1.5 py-0.5 font-medium text-[10px] text-secondary-foreground leading-none">
      Todos
    </span>
  );
}

export function PermissionBadge({
  id,
  label,
  tooltip,
  selected,
  onClick,
  scope,
}: PermissionBadgeProps) {
  const isSelectable = selected !== undefined;
  let badgeClass = "bg-primary text-primary-foreground";
  if (isSelectable) {
    badgeClass = selected
      ? "cursor-pointer bg-primary text-primary-foreground"
      : "cursor-pointer bg-secondary text-secondary-foreground hover:bg-secondary/80";
  }

  const badge = (
    <Badge
      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${badgeClass}`}
      onClick={onClick ? () => onClick(id) : undefined}
      variant="outline"
    >
      {isSelectable && selected && <CheckIcon className="h-4 w-4" />}
      {label}
      {scope && <ScopeChip scope={scope} />}
    </Badge>
  );

  if (!tooltip) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
