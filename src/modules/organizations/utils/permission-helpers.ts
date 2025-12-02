import type { Database } from "@/types/supabase";

type Permission = Database["public"]["Tables"]["permissions"]["Row"];

export type PermissionAction = "read" | "write" | "admin" | string;

export type GroupedPermissions = {
  [resource: string]: {
    resourceLabel: string;
    permissions: {
      id: string;
      action: PermissionAction;
      actionLabel: string;
      key: string;
      description: string | null;
    }[];
  };
};

function humanizeResource(resource: string): string {
  const map: Record<string, string> = {
    suppliers: "Proveedores",
    organization: "Organización",
    clients: "Clientes",
  };

  return map[resource] ?? resource;
}

function humanizeAction(action: string): string {
  const map: Record<string, string> = {
    read: "Ver",
    write: "Editar",
    admin: "Administrar",
  };

  return map[action] ?? action;
}

export function groupPermissions(
  permissions: Permission[]
): GroupedPermissions {
  return permissions.reduce<GroupedPermissions>((acc, perm) => {
    const [actionRaw, resourceRaw] = perm.key.split("."); // "read.suppliers"
    const action = (actionRaw ?? "other") as PermissionAction;
    const resource = resourceRaw ?? "general";

    if (!acc[resource]) {
      acc[resource] = {
        resourceLabel: humanizeResource(resource),
        permissions: [],
      };
    }

    acc[resource].permissions.push({
      id: perm.id,
      key: perm.key,
      description: perm.description,
      action,
      actionLabel: humanizeAction(action),
    });

    return acc;
  }, {});
}
