import "server-only";
import { isMeliAccountingIntegrationEnabled } from "@/modules/accounting/service/accounting-integration.service";
import { canManageMeliAccounting } from "../permissions";

export async function getMeliAccountingPageAccess(
  orgSlug: string,
  permissions: readonly string[]
): Promise<"enabled" | "disabled" | "error"> {
  if (!canManageMeliAccounting(permissions)) {
    return "disabled";
  }
  try {
    return (await isMeliAccountingIntegrationEnabled(orgSlug))
      ? "enabled"
      : "disabled";
  } catch {
    return "error";
  }
}
