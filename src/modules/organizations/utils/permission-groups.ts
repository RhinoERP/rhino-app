/**
 * Catálogo central de permisos suficientes para LEER/VER cada recurso.
 * Cada grupo incluye todas las variantes de lectura del recurso
 * (ver propias, ver todas, gestionar, gestionar todas cuando existen),
 * para que los guards de lectura no redirijan a usuarios que tienen
 * cualquiera de esos niveles.
 *
 * Usar en guards de páginas y en server actions de solo lectura:
 *   await guardOrganizationPermissionAccess(orgSlug, READ_PERMISSIONS.orders);
 *   await ensure(READ_PERMISSIONS.orders, orgSlug);
 */
export const READ_PERMISSIONS: Record<string, string[]> = {
  sales: ["sales.read", "sales.read.all", "sales.manage", "sales.manage.all"],
  collections: [
    "collections.read",
    "collections.read.all",
    "collections.manage",
  ],
  quotes: [
    "quotes.read",
    "quotes.read.all",
    "quotes.manage",
    "quotes.manage.all",
  ],
  pricelists: ["pricelists.read", "pricelists.read.all", "pricelists.manage"],
  orders: [
    "orders.read",
    "orders.read.all",
    "orders.manage",
    "orders.manage.all",
    "orders.finance_review",
    "orders.stock_review",
    "orders.production",
    "orders.dispatch",
  ],
  inventory: ["inventory.read", "inventory.read.all", "inventory.manage"],
  purchases: ["purchases.read", "purchases.read.all", "purchases.manage"],
  suppliers: ["suppliers.read", "suppliers.read.all", "suppliers.manage"],
  customers: ["customers.read", "customers.read.all", "customers.manage"],
  finances: ["finances.read", "finances.read.all", "finances.manage"],
  creditnotes: [
    "creditnotes.read",
    "creditnotes.read.all",
    "creditnotes.manage",
  ],
  debitnotes: ["debitnotes.read", "debitnotes.manage"],
  pos: ["pos.read", "pos.read.all", "pos.manage"],
  commissions: ["commissions.read"],
  accounting: ["accounting.read", "accounting.manage"],
  whatsapp: ["whatsapp.read", "whatsapp.manage"],
};
