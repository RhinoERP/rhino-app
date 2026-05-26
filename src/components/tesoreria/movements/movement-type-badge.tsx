import { Badge } from "@/components/ui/badge";
import {
  BANK_MOVEMENT_TYPE_LABELS,
  type BankMovementType,
} from "@/modules/tesoreria/types";

type Props = { type: BankMovementType };

const variants: Record<
  BankMovementType,
  "default" | "secondary" | "destructive" | "outline"
> = {
  credit: "default",
  adjustment_positive: "default",
  debit: "destructive",
  adjustment_negative: "destructive",
  rejected_check: "destructive",
};

const colors: Record<BankMovementType, string> = {
  credit: "bg-green-100 text-green-800 border-green-200",
  adjustment_positive: "bg-blue-100 text-blue-800 border-blue-200",
  debit: "bg-red-100 text-red-800 border-red-200",
  adjustment_negative: "bg-orange-100 text-orange-800 border-orange-200",
  rejected_check: "bg-red-100 text-red-800 border-red-200",
};

export function MovementTypeBadge({ type }: Props) {
  return (
    <Badge
      className={`border font-medium ${colors[type]}`}
      variant={variants[type]}
    >
      {BANK_MOVEMENT_TYPE_LABELS[type]}
    </Badge>
  );
}
