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
      actionTooltip?: string;
      key: string;
      description: string | null;
    }[];
  };
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: tooltip copy centralizes resource-specific guidance and generic fallbacks in one place
function buildPermissionTooltip(
  resource: string,
  action: string,
  key: string,
  description: string | null
): string {
  if (resource === "organization" && action === "admin") {
    return (
      description ??
      "Da acceso total a la organización, incluyendo configuración, miembros, roles y permisos."
    );
  }

  if (resource === "sales") {
    if (key === "sales.read") {
      return "Permite ver solo las ventas creadas por el propio usuario.";
    }

    if (key === "sales.read.all") {
      return "Permite ver las ventas de toda la organización sin acceso a configuración ni miembros.";
    }

    if (key === "sales.manage") {
      return "Permite crear, editar, confirmar, despachar, entregar, cancelar o eliminar solo las ventas propias.";
    }

    if (key === "sales.manage.all") {
      return "Permite crear y gestionar cualquier venta de la organización, incluso si fue creada por otro usuario, sin dar acceso a configuración ni miembros.";
    }
  }

  if (resource === "collections") {
    if (key === "collections.read") {
      return "Permite gestionar solo las cobranzas generadas por las propias ventas.";
    }

    if (key === "collections.manage") {
      return "Permite gestionar todas las cobranzas de la organización.";
    }
  }

  if (description) {
    return description;
  }

  const resourceLabel = humanizeResource(resource).toLowerCase();

  if (action === "read") {
    return `Permite ver ${resourceLabel}.`;
  }

  if (action === "read.all") {
    return `Permite ver todos los registros de ${resourceLabel} de la organización.`;
  }

  if (action === "manage") {
    return `Permite gestionar ${resourceLabel}.`;
  }

  if (action === "manage.all") {
    return `Permite gestionar todos los registros de ${resourceLabel} de la organización.`;
  }

  if (action === "admin") {
    return `Permite administrar ${resourceLabel}.`;
  }

  return `Permiso ${key}.`;
}

function parsePermissionKey(
  key: string
): { resource: string; action: PermissionAction } | null {
  const [resource, ...actionParts] = key.split(".");

  if (!resource || actionParts.length === 0) {
    return null;
  }

  return {
    resource,
    action: actionParts.join(".") as PermissionAction,
  };
}

function humanizeResource(resource: string): string {
  const map: Record<string, string> = {
    dashboard: "Dashboard",
    arca: "ARCA",
    inventory: "Inventario",
    suppliers: "Proveedores",
    organization: "Organización",
    clients: "Clientes",
    customers: "Clientes",
    pricelists: "Listas de precios",
    categories: "Categorías",
    sales: "Ventas",
    purchases: "Compras",
    collections: "Cobranzas",
    finances: "Finanzas",
    creditnotes: "Notas de crédito",
    pos: "Venta directa",
  };

  return map[resource] ?? resource;
}

function humanizeAction(
  action: string,
  resource?: string,
  key?: string
): string {
  if (resource === "sales") {
    if (key === "sales.read") {
      return "Ver propias";
    }
    if (key === "sales.read.all") {
      return "Ver todas";
    }
    if (key === "sales.manage") {
      return "Gestionar propias";
    }
    if (key === "sales.manage.all") {
      return "Gestionar todas";
    }
  }

  if (resource === "collections") {
    if (key === "collections.read") {
      return "Gestionar propias";
    }
    if (key === "collections.manage") {
      return "Gestionar todas";
    }
  }

  const map: Record<string, string> = {
    read: "Ver",
    "read.all": "Ver todas",
    manage: "Gestionar",
    "manage.all": "Gestionar todas",
    admin: "Administrar",
  };

  return map[action] ?? action;
}

export function groupPermissions(
  permissions: Permission[]
): GroupedPermissions {
  const grouped = permissions.reduce<GroupedPermissions>((acc, perm) => {
    const parsedPermission = parsePermissionKey(perm.key);
    if (!parsedPermission) {
      return acc;
    }

    const { resource, action } = parsedPermission;

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
      actionLabel: humanizeAction(action, resource, perm.key),
      actionTooltip: buildPermissionTooltip(
        resource,
        action,
        perm.key,
        perm.description
      ),
    });

    return acc;
  }, {});

  const actionOrder: Record<string, number> = {
    read: 0,
    "read.all": 1,
    manage: 2,
    "manage.all": 3,
    admin: 4,
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
