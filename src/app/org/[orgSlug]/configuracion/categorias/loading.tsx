import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";

export default function CategoriesPageLoading() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Categorías</h1>
        <p className="text-muted-foreground text-sm">
          Organiza tus productos con categorías y subcategorías.
        </p>
      </div>
      <DataTableSkeleton
        columnCount={4}
        filterCount={0}
        rowCount={8}
        shrinkZero={false}
      />
    </div>
  );
}
