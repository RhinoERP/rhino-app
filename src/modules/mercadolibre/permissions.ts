export const MELI_READ_PERMISSIONS = [
  "mercadolibre.access",
  "mercadolibre.manage",
  "mercadolibre.invoice",
];

export const MELI_PAYMENT_READ_PERMISSIONS = [
  "mercadolibre.payments.read",
  "mercadolibre.payments.manage",
];

export function hasMeliPaymentsAccess(permissions: readonly string[]): boolean {
  return (
    permissions.includes("organization.admin") ||
    MELI_PAYMENT_READ_PERMISSIONS.some((permission) =>
      permissions.includes(permission)
    )
  );
}

export function canManageMeliPayments(permissions: readonly string[]): boolean {
  return (
    permissions.includes("organization.admin") ||
    permissions.includes("mercadolibre.payments.manage")
  );
}

export function hasMeliAccess(permissions: readonly string[]): boolean {
  return (
    permissions.includes("organization.admin") ||
    MELI_READ_PERMISSIONS.some((permission) => permissions.includes(permission))
  );
}
