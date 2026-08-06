"use client";

import { PermissionBadge } from "./permission-badge";

type PermissionGroupPermission = {
  id: string;
  actionLabel: string;
  actionTooltip?: string;
  scope?: "own" | "all";
};

type PermissionGroupProps = {
  resourceLabel: string;
  permissions: PermissionGroupPermission[];
  selectedIds?: Set<string>;
  onToggle?: (id: string) => void;
};

export function PermissionGroup({
  resourceLabel,
  permissions,
  selectedIds,
  onToggle,
}: PermissionGroupProps) {
  return (
    <div className="space-y-2">
      <div className="font-semibold text-sm">{resourceLabel}</div>
      <div className="flex flex-wrap gap-2">
        {permissions.map((perm) => (
          <PermissionBadge
            id={perm.id}
            key={perm.id}
            label={perm.actionLabel}
            onClick={onToggle}
            scope={perm.scope}
            selected={selectedIds ? selectedIds.has(perm.id) : undefined}
            tooltip={perm.actionTooltip}
          />
        ))}
      </div>
    </div>
  );
}
