import type { CaiOperation, CaiSettings } from "./cai";

const cuitSeparators = /\D/g;

function isFresh(operation: CaiOperation, now: number, maxAge: number) {
  const age = now - Date.parse(operation.created_at);
  return Number.isFinite(age) && age >= 0 && age < maxAge;
}

export function hasCaiRequestValidation({
  operations,
  settings,
  cuit,
  quantity,
  now = Date.now(),
}: {
  operations: CaiOperation[];
  settings: CaiSettings | null;
  cuit: string | null;
  quantity: number;
  now?: number;
}) {
  if (
    !(settings && Number.isInteger(quantity)) ||
    quantity < 1 ||
    quantity > 99_999_999
  ) {
    return false;
  }
  return operations.some((operation) => {
    const comprobantes = operation.params.comprobantes;
    if (!Array.isArray(comprobantes) || comprobantes.length !== 1) {
      return false;
    }
    const comprobante: unknown = comprobantes[0];
    if (!comprobante || typeof comprobante !== "object") {
      return false;
    }
    return (
      operation.kind === "validate" &&
      operation.state === "complete" &&
      operation.result?.status === "validated" &&
      isFresh(operation, now, 60 * 60 * 1000) &&
      operation.params.username === settings.loginCuit &&
      operation.params.cuit === cuit?.replace(cuitSeparators, "") &&
      "cantidad" in comprobante &&
      comprobante.cantidad === quantity &&
      "puntoVenta" in comprobante &&
      comprobante.puntoVenta === settings.pointOfSale &&
      "tipoComprobante" in comprobante &&
      comprobante.tipoComprobante === 91
    );
  });
}

export function hasCaiCancellationValidation(
  operations: CaiOperation[],
  cai: string,
  now = Date.now()
) {
  return operations.some(
    (operation) =>
      operation.kind === "check_cancel" &&
      operation.state === "complete" &&
      operation.result?.status === "cancellable" &&
      operation.params.cai === cai &&
      isFresh(operation, now, 15 * 60 * 1000)
  );
}

export function canReconcileCaiOperation(
  operation: CaiOperation,
  now = Date.now()
) {
  if (operation.state === "uncertain") {
    return true;
  }
  return (
    ["starting", "pending"].includes(operation.state) &&
    now - Date.parse(operation.created_at) >= 10 * 60 * 1000
  );
}
