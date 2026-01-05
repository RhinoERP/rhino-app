import type { Database } from "@/types/supabase";

type Permission = Database["public"]["Tables"]["permissions"]["Row"];

export type PermissionAction = "read" | "admin" | string;

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
    customers: "Clientes",
    pricelists: "Listas de precios",
    categories: "Categorías",
  };

  return map[resource] ?? resource;
}

function humanizeAction(action: string): string {
  const map: Record<string, string> = {
    read: "Ver",
    manage: "Gestionar",
    admin: "Administrar",
  };

  return map[action] ?? action;
}

export function groupPermissions(
  permissions: Permission[]
): GroupedPermissions {
  const grouped = permissions.reduce<GroupedPermissions>((acc, perm) => {
    const parts = perm.key.split(".");
    if (parts.length !== 2) {
      return acc;
    }

    const [resource, actionRaw] = parts;
    const action = (actionRaw ?? "other") as PermissionAction;

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

  const actionOrder: Record<string, number> = {
    read: 0,
    manage: 1,
    admin: 2,
  };

  for (const resource of Object.keys(grouped)) {
    grouped[resource].permissions.sort((a, b) => {
      if (a.key === "organization.admin") {
        return -1;
      }
      if (b.key === "organization.admin") {
        return 1;
      }

      const orderA = actionOrder[a.action] ?? 999;
      const orderB = actionOrder[b.action] ?? 999;
      return orderA - orderB;
    });
  }

  const sortedGrouped: GroupedPermissions = {};
  const resourceOrder = Object.keys(grouped).sort((a, b) => {
    if (a === "organization") {
      return -1;
    }
    if (b === "organization") {
      return 1;
    }
    return a.localeCompare(b);
  });

  for (const resource of resourceOrder) {
    sortedGrouped[resource] = grouped[resource];
  }

  return sortedGrouped;
}
