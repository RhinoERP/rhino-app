import { Badge } from "@/components/ui/badge";
import { CHECK_STATUS_LABELS, type CheckStatus } from "@/modules/tesoreria/types";

type Props = { status: CheckStatus };

const colors: Record<CheckStatus, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  debited: "bg-green-100 text-green-800 border-green-200",
  exchanged: "bg-slate-100 text-slate-700 border-slate-200",
  overdue: "bg-red-100 text-red-800 border-red-200",
};

export function CheckStatusBadge({ status }: Props) {
  return (
    <Badge className={`border font-medium ${colors[status]}`} variant="outline">
      {CHECK_STATUS_LABELS[status]}
    </Badge>
  );
}
