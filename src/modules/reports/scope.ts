/** Permiso de entrada: no reemplaza los permisos de cada fuente de datos. */
export function canUseReports(permissions: string[]): boolean {
  return (
    permissions.includes("organization.admin") ||
    permissions.includes("reports.manage")
  );
}

/** El acceso a todos los comprobantes depende del permiso del módulo, no de la cartera asignada. */
export function canReadAllReportRows(
  datasetId: string,
  permissions: string[]
): boolean {
  if (permissions.includes("organization.admin")) {
    return true;
  }
  const allPermissions: Record<string, string[]> = {
    ventas: ["sales.read.all", "sales.manage.all"],
    ventas_productos: ["sales.read.all", "sales.manage.all"],
    notas_credito: ["creditnotes.read.all", "creditnotes.manage.all"],
    clientes: [
      "customers.read.all",
      "clients.read.all",
      "sales.read.all",
      "sales.manage.all",
    ],
    cobranzas: [
      "collections.read.all",
      "collections.manage",
      "collections.manage.all",
    ],
    deuda_clientes: [
      "collections.read.all",
      "collections.manage",
      "collections.manage.all",
    ],
  };
  return (allPermissions[datasetId] ?? []).some((key) =>
    permissions.includes(key)
  );
}
