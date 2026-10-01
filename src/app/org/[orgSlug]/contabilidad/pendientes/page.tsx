import { notFound } from "next/navigation";
import { AsientosPendientes } from "@/components/accounting/asientos-pendientes";
import { PosSalesAccountingInbox } from "@/components/accounting/pos-sales-accounting-inbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type Props = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function PendientesPage({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const { tab } = await searchParams;
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    notFound();
  }

  return (
    <Tabs defaultValue={tab === "ventas-pos" ? "ventas-pos" : "informales"}>
      <TabsList>
        <TabsTrigger value="informales">Asientos informales</TabsTrigger>
        <TabsTrigger value="ventas-pos">
          Ventas POS sin contabilizar
        </TabsTrigger>
      </TabsList>
      <TabsContent value="informales">
        <AsientosPendientes orgId={org.id} orgSlug={orgSlug} />
      </TabsContent>
      <TabsContent value="ventas-pos">
        <PosSalesAccountingInbox orgSlug={orgSlug} />
      </TabsContent>
    </Tabs>
  );
}
