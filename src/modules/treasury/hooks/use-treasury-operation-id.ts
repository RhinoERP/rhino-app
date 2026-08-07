"use client";

import { useCallback, useRef } from "react";

const createOperationId = (): string => crypto.randomUUID();

export function useTreasuryOperationId() {
  const operationIdRef = useRef<string>(createOperationId());

  const getOperationId = useCallback((): string => operationIdRef.current, []);

  const resetOperationId = useCallback((): void => {
    operationIdRef.current = createOperationId();
  }, []);

  return {
    getOperationId,
    resetOperationId,
  };
}
