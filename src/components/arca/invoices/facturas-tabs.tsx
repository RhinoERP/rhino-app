"use client";

import { SupplierInvoicesManager } from "@/components/purchases/supplier-invoices-manager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AuthorizedArcaInvoiceListItem } from "@/modules/arca/server/invoices.service";
import type { ManualFiscalInvoice } from "@/modules/arca/server/manual-fiscal-invoices.service";
import type {
  SupplierInvoicePurchaseOrderOption,
  SupplierInvoiceWithRelations,
} from "@/modules/purchases/supplier-invoices.types";
import type { Supplier } from "@/modules/suppliers/types";
import { ArcaInvoicesTable } from "./arca-invoices-table";
import { ManualFiscalInvoicesPanel } from "./manual-fiscal-invoices-panel";

type CustomerOption = {
  id: string;
  business_name: string;
  fantasy_name: string | null;
  email: string | null;
};

export function FacturasTabs(props: {
  orgSlug: string;
  sales: AuthorizedArcaInvoiceListItem[];
  manualInvoices: ManualFiscalInvoice[];
  supplierInvoices: SupplierInvoiceWithRelations[];
  suppliers: Supplier[];
  purchaseOrders: SupplierInvoicePurchaseOrderOption[];
  customers: CustomerOption[];
  canIssue: boolean;
  canManagePurchases: boolean;
}) {
  const {
    orgSlug,
    sales,
    manualInvoices,
    supplierInvoices,
    suppliers,
    purchaseOrders,
    customers,
    canIssue,
    canManagePurchases,
  } = props;
  return (
    <Tabs className="space-y-4" defaultValue="all">
      <TabsList>
        <TabsTrigger value="all">Todas</TabsTrigger>
        <TabsTrigger value="sales">Ventas</TabsTrigger>
        <TabsTrigger value="uploaded">Proveedor</TabsTrigger>
        <TabsTrigger value="manual">Manuales</TabsTrigger>
      </TabsList>
      <TabsContent className="space-y-8" value="all">
        <section>
          <h2 className="mb-3 font-medium">Ventas</h2>
          <ArcaInvoicesTable invoices={sales} orgSlug={orgSlug} />
        </section>
        <section>
          <h2 className="mb-3 font-medium">Facturas manuales</h2>
          <ManualFiscalInvoicesPanel
            canIssue={canIssue}
            customers={customers}
            invoices={manualInvoices}
            orgSlug={orgSlug}
          />
        </section>
        <section>
          <h2 className="mb-3 font-medium">Facturas de proveedor</h2>
          {canManagePurchases ? (
            <SupplierInvoicesManager
              invoices={supplierInvoices}
              orgSlug={orgSlug}
              purchaseOrders={purchaseOrders}
              suppliers={suppliers}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              No tenés permiso para consultar facturas recibidas.
            </p>
          )}
        </section>
      </TabsContent>
      <TabsContent value="sales">
        <ArcaInvoicesTable invoices={sales} orgSlug={orgSlug} />
      </TabsContent>
      <TabsContent value="uploaded">
        {canManagePurchases ? (
          <SupplierInvoicesManager
            invoices={supplierInvoices}
            orgSlug={orgSlug}
            purchaseOrders={purchaseOrders}
            suppliers={suppliers}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            No tenés permiso para consultar facturas recibidas.
          </p>
        )}
      </TabsContent>
      <TabsContent value="manual">
        <ManualFiscalInvoicesPanel
          canIssue={canIssue}
          customers={customers}
          invoices={manualInvoices}
          orgSlug={orgSlug}
        />
      </TabsContent>
    </Tabs>
  );
}
