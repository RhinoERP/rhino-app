import { redirect } from "next/navigation";
import { FacturasTabs } from "@/components/arca/invoices/facturas-tabs";
import { getAuthorizedArcaInvoicesByOrgSlug } from "@/modules/arca/server/invoices.service";
import { getManualFiscalInvoices } from "@/modules/arca/server/manual-fiscal-invoices.service";
import { getAllCustomersForExport } from "@/modules/customers/service/customers.service";
import { getOrganizationLayoutData } from "@/modules/organizations/service/organizations.service";
import { getPurchaseOrdersByOrgSlug } from "@/modules/purchases/service/purchases.service";
import { getSupplierInvoices } from "@/modules/purchases/service/supplier-invoices.service";
import { getAllSuppliersForExport } from "@/modules/suppliers/service/suppliers.service";

type ArcaInvoicesPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function ArcaInvoicesPage({
  params,
}: ArcaInvoicesPageProps) {
  const { orgSlug } = await params;
  const layoutData = await getOrganizationLayoutData(orgSlug);

  if (!layoutData) {
    redirect("/");
  }

  const { organizations, permissions } = layoutData;
  const organization = organizations.find((org) => org.slug === orgSlug);

  if (!organization) {
    redirect("/");
  }

  const canViewInvoices =
    permissions.includes("arca.read") ||
    permissions.includes("organization.admin");

  if (!canViewInvoices) {
    redirect(`/org/${orgSlug}`);
  }

  const canManagePurchases =
    permissions.includes("organization.admin") ||
    permissions.includes("purchases.manage") ||
    permissions.includes("purchases.read") ||
    permissions.includes("purchases.read.all");
  const canIssue =
    permissions.includes("organization.admin") ||
    permissions.includes("arca.issue");
  const [
    invoices,
    manualInvoices,
    customers,
    supplierInvoices,
    suppliers,
    purchaseOrders,
  ] = await Promise.all([
    getAuthorizedArcaInvoicesByOrgSlug(orgSlug),
    getManualFiscalInvoices(orgSlug),
    getAllCustomersForExport(orgSlug, { status: "active" }),
    canManagePurchases ? getSupplierInvoices(orgSlug) : Promise.resolve([]),
    canManagePurchases
      ? getAllSuppliersForExport(orgSlug)
      : Promise.resolve([]),
    canManagePurchases
      ? getPurchaseOrdersByOrgSlug(orgSlug)
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Facturas ARCA</h1>
        <p className="text-muted-foreground text-sm">
          Emití, cargá y consultá todos los comprobantes fiscales de{" "}
          {organization.name}.
        </p>
      </div>

      <FacturasTabs
        canIssue={canIssue}
        canManagePurchases={canManagePurchases}
        customers={customers.map((customer) => ({
          id: customer.id,
          business_name: customer.business_name,
          fantasy_name: customer.fantasy_name,
          email: customer.email,
        }))}
        manualInvoices={manualInvoices}
        orgSlug={orgSlug}
        purchaseOrders={purchaseOrders
          .filter(
            (purchase) =>
              purchase.supplier_id && purchase.status !== "CANCELLED"
          )
          .map((purchase) => ({
            id: purchase.id,
            purchase_number: purchase.purchase_number,
            supplier_id: purchase.supplier_id,
            total_amount: purchase.total_amount,
            status: purchase.status,
            currency: purchase.currency ?? "ARS",
          }))}
        sales={invoices}
        supplierInvoices={supplierInvoices}
        suppliers={suppliers}
      />
    </div>
  );
}
