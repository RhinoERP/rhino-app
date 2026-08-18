import Link from "next/link";
import { notFound } from "next/navigation";
import {
  guardOrganizationModuleAccess,
  guardOrganizationPermissionAccess,
} from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";

type ContabilidadLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
};

const NAV_LINKS = [
  { href: "diario", label: "Libro Diario" },
  { href: "mayor", label: "Libro Mayor" },
  { href: "pendientes", label: "Asientos informales" },
  { href: "iva", label: "Libro IVA" },
  { href: "iibb", label: "Libro IIBB" },
  { href: "reglas", label: "Reglas contables" },
];

export default async function ContabilidadLayout({
  children,
  params,
}: ContabilidadLayoutProps) {
  const { orgSlug } = await params;

  await guardOrganizationModuleAccess(orgSlug, "accounting");
  await guardOrganizationPermissionAccess(orgSlug, READ_PERMISSIONS.accounting);

  const org = await getOrganizationBySlug(orgSlug);

  if (!org) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Contabilidad</h1>
        <p className="text-muted-foreground text-sm">
          Libros contables y asientos de la organización.
        </p>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b pb-0">
        {NAV_LINKS.map((link) => (
          <Link
            className="whitespace-nowrap px-3 py-2 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
            href={`/org/${orgSlug}/contabilidad/${link.href}`}
            key={link.href}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div>{children}</div>
    </div>
  );
}
