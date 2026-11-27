export function resolveSiteFormMode(
  canManage: boolean,
  proposalMode: boolean
): "saveSite" | "proposeSite" {
  return canManage && !proposalMode ? "saveSite" : "proposeSite";
}
