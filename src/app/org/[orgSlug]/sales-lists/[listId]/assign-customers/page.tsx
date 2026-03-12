import { AssignCustomersClient } from "./assign-customers-client";

type AssignCustomersPageProps = {
  params: Promise<{
    orgSlug: string;
    listId: string;
  }>;
};

export default async function AssignCustomersPage({
  params,
}: AssignCustomersPageProps) {
  const { orgSlug, listId } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Asignar clientes</h1>
        <p className="text-muted-foreground text-sm">
          Asigná esta lista de precios de venta a los clientes que desees.
        </p>
      </div>
      <AssignCustomersClient listId={listId} orgSlug={orgSlug} />
    </div>
  );
}
