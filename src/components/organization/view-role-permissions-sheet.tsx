"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type {
  OrganizationRole,
  Permission,
} from "@/modules/organizations/service/roles.service";
import { groupPermissions } from "@/modules/organizations/utils/permission-helpers";
import { PermissionGroup } from "./permission-group";

type ViewRolePermissionsSheetProps = {
  role: OrganizationRole;
  permissions: Permission[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
};

export function ViewRolePermissionsSheet({
  role,
  permissions,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  trigger,
}: ViewRolePermissionsSheetProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);

  // Use controlled or internal state for open
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;

  // Filter permissions that belong to this role
  const rolePermissionIds = new Set(role.permissionIds || []);
  const rolePermissions = permissions.filter((perm) =>
    rolePermissionIds.has(perm.id)
  );

  // Group the filtered permissions
  const groupedPermissions = groupPermissions(rolePermissions);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
  };

  const sheetContent = (
    <SheetContent className="flex flex-col gap-0 p-0" side="right">
      <SheetHeader>
        <SheetTitle className="font-heading font-normal">
          Permisos del rol: {role.name}
        </SheetTitle>
        <SheetDescription>
          Lista de permisos asignados a este rol.
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        {Object.keys(groupedPermissions).length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground text-sm">
            Este rol no tiene permisos asignados.
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedPermissions).map(([resourceKey, group]) => (
              <PermissionGroup
                key={resourceKey}
                permissions={group.permissions}
                resourceLabel={group.resourceLabel}
              />
            ))}
          </div>
        )}
      </div>
    </SheetContent>
  );

  // If trigger is provided, use it
  if (trigger) {
    return (
      <Sheet onOpenChange={handleOpenChange} open={open}>
        {trigger}
        {sheetContent}
      </Sheet>
    );
  }

  // If open/onOpenChange are controlled, don't show trigger
  if (controlledOpen !== undefined || controlledOnOpenChange) {
    return (
      <Sheet onOpenChange={handleOpenChange} open={open}>
        {sheetContent}
      </Sheet>
    );
  }

  // Default: with trigger
  return (
    <Sheet onOpenChange={handleOpenChange} open={open}>
      <SheetTrigger asChild>
        <Button variant="outline">Ver permisos</Button>
      </SheetTrigger>
      {sheetContent}
    </Sheet>
  );
}
