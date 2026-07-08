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
};

export function PermissionBadge({
  id,
  label,
  tooltip,
  selected,
  onClick,
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
