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

  if (resource === "orders") {
    if (key === "orders.dispatch") {
      return "Permite gestionar el despacho y la entrega de los pedidos.";
    }

    if (key === "orders.production") {
      return "Permite gestionar la producción y el diseño de los pedidos.";
    }

    if (key === "orders.stock_review") {
      return "Permite verificar el stock de los pedidos.";
    }

    if (key === "orders.finance_review") {
      return "Permite aprobar o rechazar pedidos en finanzas.";
    }
  }

  if (key === "pos.returns.manage") {
    return "Permite gestionar las devoluciones de venta directa.";
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

  if (action === "write") {
    return `Permite crear y editar registros de ${resourceLabel}.`;
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

export function parsePermissionKey(
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
    orders: "Pedidos",
    returns: "Devoluciones",
  };

  return map[resource] ?? resource;
}

function humanizeAction(
  action: string,
  _resource?: string,
  key?: string
): string {
  if (key) {
    const specialLabels: Record<string, string> = {
      "sales.read": "Ver propias",
      "sales.read.all": "Ver todas",
      "sales.manage": "Gestionar propias",
      "sales.manage.all": "Gestionar todas",
      "collections.read": "Gestionar propias",
      "collections.manage": "Gestionar todas",
      "orders.dispatch": "Despacho",
      "orders.production": "Producción",
      "orders.stock_review": "Revisión de stock",
      "orders.finance_review": "Revisión financiera",
      "pos.returns.manage": "Gestionar devoluciones",
    };

    if (specialLabels[key]) {
      return specialLabels[key];
    }
  }

  const map: Record<string, string> = {
    read: "Ver",
    "read.all": "Ver todas",
    write: "Crear",
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
    write: 2,
    "returns.manage": 3,
    dispatch: 4,
    production: 5,
    stock_review: 6,
    finance_review: 7,
    manage: 8,
    "manage.all": 8,
    admin: 9,
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
