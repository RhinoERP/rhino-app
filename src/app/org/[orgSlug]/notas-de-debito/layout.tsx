import type { ReactNode } from "react";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";

type DebitNotesLayoutProps = {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
};

export default async function DebitNotesLayout({
  children,
  params,
}: DebitNotesLayoutProps) {
  const { orgSlug } = await params;
  // Reutilizamos el permiso de creditnotes ya que ambas son operaciones de ajuste.
  // Si querés un permiso separado (ej: "debitnotes.read"), agregalo en la DB de permisos.
  await guardOrganizationPermissionAccess(orgSlug, "creditnotes.read");

  return children;
}
