import { SupplierInvoicesManager } from "@/components/purchases/supplier-invoices-manager";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { getPurchaseOrdersByOrgSlug } from "@/modules/purchases/service/purchases.service";
import { getSupplierInvoices } from "@/modules/purchases/service/supplier-invoices.service";
import { getAllSuppliersForExport } from "@/modules/suppliers/service/suppliers.service";

type SupplierInvoicesPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function SupplierInvoicesPage({
  params,
}: SupplierInvoicesPageProps) {
  const { orgSlug } = await params;
  await guardOrganizationPermissionAccess(orgSlug, READ_PERMISSIONS.purchases);

  const [invoices, suppliers, purchaseOrders] = await Promise.all([
    getSupplierInvoices(orgSlug),
    getAllSuppliersForExport(orgSlug),
    getPurchaseOrdersByOrgSlug(orgSlug),
  ]);

  return (
    <div className="space-y-6">
      <SupplierInvoicesManager
        invoices={invoices}
        orgSlug={orgSlug}
        purchaseOrders={purchaseOrders
          .filter(
            (purchaseOrder) =>
              purchaseOrder.supplier_id && purchaseOrder.status !== "CANCELLED"
          )
          .map((purchaseOrder) => ({
            id: purchaseOrder.id,
            purchase_number: purchaseOrder.purchase_number,
            supplier_id: purchaseOrder.supplier_id,
            total_amount: purchaseOrder.total_amount,
            status: purchaseOrder.status,
          }))}
        suppliers={suppliers}
      />
    </div>
  );
}
