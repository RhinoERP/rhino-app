import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";

export default function MiembrosPageLoading() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Miembros</h1>
        <p className="text-muted-foreground text-sm">
          Gestiona los miembros y las invitaciones de tu organización.
        </p>
      </div>
      <DataTableSkeleton
        columnCount={4}
        filterCount={1}
        rowCount={8}
        shrinkZero={false}
      />
    </div>
  );
}
