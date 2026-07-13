import type { Permission } from "@/modules/organizations/service/roles.service";
import { parsePermissionKey } from "./permission-helpers";

export function handleDeselect({
  next,
  permissionId,
  resource,
  action,
  permissions,
}: {
  next: Set<string>;
  permissionId: string;
  resource: string;
  action: string;
  permissions: Permission[];
}): void {
  next.delete(permissionId);

  let dependentKeys: string[] = [];

  if (action === "read") {
    dependentKeys = [
      `${resource}.manage`,
      `${resource}.read.all`,
      `${resource}.manage.all`,
    ];
  } else if (action === "read.all" || action === "manage") {
    dependentKeys = [`${resource}.manage.all`];
  }

  for (const dependentKey of dependentKeys) {
    const dependentPermission = permissions.find((p) => p.key === dependentKey);
    if (dependentPermission && next.has(dependentPermission.id)) {
      next.delete(dependentPermission.id);
    }
  }
}

export function handleSelect({
  next,
  permissionId,
  resource,
  action,
  permissions,
}: {
  next: Set<string>;
  permissionId: string;
  resource: string;
  action: string;
  permissions: Permission[];
}): void {
  next.add(permissionId);

  if (action === "manage" || action === "read.all") {
    const readPermission = permissions.find(
      (p) => p.key === `${resource}.read`
    );
    if (readPermission) {
      next.add(readPermission.id);
    }
  }

  if (action === "manage.all") {
    for (const requiredKey of [
      `${resource}.read`,
      `${resource}.read.all`,
      `${resource}.manage`,
    ]) {
      const requiredPermission = permissions.find((p) => p.key === requiredKey);
      if (requiredPermission) {
        next.add(requiredPermission.id);
      }
    }
  }
}

export function togglePermission({
  permissionId,
  permissions,
  selectedPermissions,
}: {
  permissionId: string;
  permissions: Permission[];
  selectedPermissions: Set<string>;
}): Set<string> {
  const permission = permissions.find((p) => p.id === permissionId);
  if (!permission) {
    return selectedPermissions;
  }

  const parsed = parsePermissionKey(permission.key);
  if (!parsed) {
    const next = new Set(selectedPermissions);
    if (next.has(permissionId)) {
      next.delete(permissionId);
    } else {
      next.add(permissionId);
    }
    return next;
  }

  const { resource, action } = parsed;
  const next = new Set(selectedPermissions);
  const isCurrentlySelected = next.has(permissionId);

  if (isCurrentlySelected) {
    handleDeselect({ next, permissionId, resource, action, permissions });
  } else {
    handleSelect({ next, permissionId, resource, action, permissions });
  }

  return next;
}
