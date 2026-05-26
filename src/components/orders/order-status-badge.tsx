import { cn } from "@/lib/utils";
import {
  ORDER_STATUS_CONFIG,
  type OrderFlowStatus,
} from "@/modules/orders/types";

type OrderStatusBadgeProps = {
  status: OrderFlowStatus;
  className?: string;
};

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  const config = ORDER_STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 font-medium text-xs",
        config.bgColor,
        config.color,
        config.borderColor,
        className
      )}
    >
      {config.label}
    </span>
  );
}
