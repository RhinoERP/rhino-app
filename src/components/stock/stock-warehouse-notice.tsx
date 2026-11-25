import Link from "next/link";
import { Button } from "@/components/ui/button";

export function StockWarehouseNotice({
  orgSlug,
  searchParams,
  message,
}: {
  orgSlug: string;
  searchParams: Record<string, string | undefined>;
  message: string;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value && key !== "deposito" && key !== "page") {
      query.set(key, value);
    }
  }
  const search = query.toString();
  return (
    <div className="space-y-4">
      <h1 className="font-heading text-2xl">Stock</h1>
      <section className="space-y-2 rounded-md border p-4" role="alert">
        <h2 className="font-medium">Depósito no disponible</h2>
        <p className="text-muted-foreground text-sm">{message}</p>
      </section>
      <Button asChild variant="outline">
        <Link href={`/org/${orgSlug}/stock${search ? `?${search}` : ""}`}>
          Volver a los depósitos accesibles
        </Link>
      </Button>
    </div>
  );
}
