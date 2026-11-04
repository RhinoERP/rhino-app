import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";

export default function DepositosPageLoading() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Depósitos</h1>
        <p className="text-muted-foreground text-sm">
          Administrá depósitos, canales de operación y el acceso de cada
          usuario.
        </p>
      </div>
      <DataTableSkeleton
        columnCount={5}
        filterCount={0}
        rowCount={6}
        shrinkZero={false}
      />
    </div>
  );
}
