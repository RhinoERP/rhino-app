import "server-only";
import { redirect } from "next/navigation";
import { getOrganizationLayoutData } from "@/modules/organizations/service/organizations.service";
import { getCollectionsSectionsAccess } from "../utils/sections-access";

export async function getCollectionsPageAccess(
  orgSlug: string,
  section?: "currentAccounts" | "mercadoLibre"
) {
  const layout = await getOrganizationLayoutData(orgSlug);
  if (!layout) {
    redirect("/auth/login");
  }
  const sections = getCollectionsSectionsAccess(
    layout.currentOrganization,
    layout.permissions
  );
  if (section === "currentAccounts" && !sections.currentAccounts) {
    redirect(
      sections.mercadoLibre
        ? `/org/${orgSlug}/cobranzas/mercado-libre`
        : `/org/${orgSlug}`
    );
  }
  if (section === "mercadoLibre" && !sections.mercadoLibre) {
    redirect(`/org/${orgSlug}`);
  }
  if (!(sections.currentAccounts || sections.mercadoLibre)) {
    redirect(`/org/${orgSlug}`);
  }
  return { layout, sections };
}
