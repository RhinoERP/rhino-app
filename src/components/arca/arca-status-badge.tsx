import { Badge } from "@/components/ui/badge";

export type ArcaStatus = "not_requested" | "pending" | "authorized" | "error";

export function ArcaStatusBadge({ status }: { status: ArcaStatus }) {
  if (status === "authorized") {
    return (
      <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
        ✓ Autorizado en ARCA
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge className="border-rose-500/20" variant="destructive">
        Error ARCA
      </Badge>
    );
  }
  if (status === "pending") {
    return <Badge variant="secondary">Pendiente</Badge>;
  }
  return null;
}
