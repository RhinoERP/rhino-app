"use client";

import { useCallback, useEffect, useState } from "react";
import { checkOrderRevertAction } from "@/modules/orders/actions/check-order-revert.action";
import type { OrderFlowStatus } from "@/modules/orders/types";

type UseOrderRevertResult = {
  canRevert: boolean;
  previousStatus: OrderFlowStatus | null;
  previousStatusLabel: string | null;
  revertType: "normal" | "undo_creation";
  isLoading: boolean;
  refresh: () => void;
};

export function useOrderRevert(
  orgSlug: string,
  orderId: string
): UseOrderRevertResult {
  const [canRevert, setCanRevert] = useState(false);
  const [previousStatus, setPreviousStatus] = useState<OrderFlowStatus | null>(
    null
  );
  const [previousStatusLabel, setPreviousStatusLabel] = useState<string | null>(
    null
  );
  const [revertType, setRevertType] = useState<"normal" | "undo_creation">(
    "normal"
  );
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    setIsLoading(true);
    checkOrderRevertAction(orgSlug, orderId)
      .then((result) => {
        setCanRevert(result.canRevert);
        setPreviousStatus(result.previousStatus as OrderFlowStatus | null);
        setPreviousStatusLabel(result.previousLabel);
        setRevertType(result.revertType);
      })
      .finally(() => setIsLoading(false));
  }, [orgSlug, orderId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    canRevert,
    previousStatus,
    previousStatusLabel,
    revertType,
    isLoading,
    refresh,
  };
}
