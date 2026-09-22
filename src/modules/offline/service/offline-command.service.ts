import { createAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import type {
  CommercialChange,
  OfflineCommandResult,
  OfflineCommandV1,
} from "@/modules/offline/contracts/offline-command";
import type { SellerOfflineSnapshotV1 } from "@/modules/offline/contracts/seller-offline-snapshot";
import { buildOfflineProductPriceMap } from "@/modules/offline/pricing/offline-pre-sale-pricing";
import {
  createSellerOfflineSnapshot,
  SellerOfflineSnapshotError,
} from "@/modules/offline/service/seller-offline-snapshot.service";

type OfflineCommandErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "STALE_REFERENCE"
  | "REVIEW_REQUIRED"
  | "RETRYABLE";

export class OfflineCommandError extends Error {
  readonly changes?: CommercialChange[];
  readonly code: OfflineCommandErrorCode;
  readonly retryable: boolean;
  readonly status: number;

  constructor(params: {
    changes?: CommercialChange[];
    code: OfflineCommandErrorCode;
    message: string;
    retryable: boolean;
    status: number;
  }) {
    super(params.message);
    this.name = "OfflineCommandError";
    this.changes = params.changes;
    this.code = params.code;
    this.retryable = params.retryable;
    this.status = params.status;
  }
}

const normalizeTaxes = (
  taxes: OfflineCommandV1["payload"]["items"][number]["taxes"]
) =>
  taxes
    .map((tax) => ({
      code: tax.code,
      name: tax.name,
      rate: tax.rate,
      taxId: tax.taxId,
    }))
    .sort((left, right) => left.taxId.localeCompare(right.taxId));

export function findOfflinePreSaleCommercialChanges(
  command: OfflineCommandV1,
  snapshot: SellerOfflineSnapshotV1
): CommercialChange[] {
  const changes: CommercialChange[] = [];
  const customer = snapshot.customers.find(
    (entry) => entry.id === command.payload.customerId
  );
  if (!customer) {
    throw new OfflineCommandError({
      code: "STALE_REFERENCE",
      message: "El cliente ya no esta disponible para este vendedor",
      retryable: false,
      status: 409,
    });
  }

  if (
    !snapshot.sellers.some((seller) => seller.id === command.payload.sellerId)
  ) {
    throw new OfflineCommandError({
      code: "STALE_REFERENCE",
      message: "El vendedor ya no esta disponible",
      retryable: false,
      status: 409,
    });
  }

  const currentPrices = buildOfflineProductPriceMap(
    snapshot,
    command.payload.customerId
  );
  const products = new Map(
    snapshot.products.map((product) => [product.id, product])
  );
  const fallbackTaxes = snapshot.settings.defaultTaxIds.flatMap((taxId) => {
    const tax = snapshot.taxes.find((entry) => entry.id === taxId);
    return tax
      ? [{ taxId: tax.id, name: tax.name, rate: tax.rate, code: tax.code }]
      : [];
  });

  for (const [index, item] of command.payload.items.entries()) {
    const product = products.get(item.productId);
    const currentPrice = currentPrices.get(item.productId);
    if (!(product && currentPrice !== undefined)) {
      throw new OfflineCommandError({
        code: "STALE_REFERENCE",
        message: "Uno de los productos ya no esta disponible",
        retryable: false,
        status: 409,
      });
    }

    if (Math.abs(currentPrice - item.unitPrice) >= 0.01) {
      changes.push({
        path: `payload.items.${index}.unitPrice`,
        message: `El precio de ${product.name} cambio`,
        capturedValue: item.unitPrice,
        currentValue: currentPrice,
      });
    }

    const capturedTaxes = JSON.stringify(normalizeTaxes(item.taxes));
    const currentTaxes = JSON.stringify(
      normalizeTaxes(product.taxes.length > 0 ? product.taxes : fallbackTaxes)
    );
    if (capturedTaxes !== currentTaxes) {
      changes.push({
        path: `payload.items.${index}.taxes`,
        message: `Los impuestos de ${product.name} cambiaron`,
        capturedValue: capturedTaxes,
        currentValue: currentTaxes,
      });
    }
  }

  return changes;
}

const mapSnapshotError = (error: SellerOfflineSnapshotError) => {
  if (error.code === "AUTH_REQUIRED") {
    return new OfflineCommandError({
      code: "AUTH_REQUIRED",
      message: "La sesion no es valida",
      retryable: true,
      status: 401,
    });
  }
  return new OfflineCommandError({
    code: "FORBIDDEN",
    message: error.message,
    retryable: false,
    status: 403,
  });
};

const mapRpcError = (error: {
  code?: string;
  details?: string;
  hint?: string;
  message: string;
}) => {
  const { message } = error;
  if (message.includes("OFFLINE_AUTH_REQUIRED")) {
    return new OfflineCommandError({
      code: "AUTH_REQUIRED",
      message: "La sesion no es valida",
      retryable: true,
      status: 401,
    });
  }
  if (message.includes("OFFLINE_FORBIDDEN")) {
    return new OfflineCommandError({
      code: "FORBIDDEN",
      message: "No tienes permisos para sincronizar esta preventa",
      retryable: false,
      status: 403,
    });
  }
  if (message.includes("OFFLINE_STALE_REFERENCE")) {
    return new OfflineCommandError({
      code: "STALE_REFERENCE",
      message: "Una referencia de la preventa ya no esta disponible",
      retryable: false,
      status: 409,
    });
  }
  if (message.includes("OFFLINE_REVIEW_REQUIRED")) {
    return new OfflineCommandError({
      code: "REVIEW_REQUIRED",
      message: "La preventa tiene cambios comerciales para revisar",
      retryable: false,
      status: 409,
    });
  }
  if (
    message.includes("OFFLINE_VALIDATION_ERROR") ||
    message.includes("OFFLINE_IDEMPOTENCY_CONFLICT")
  ) {
    return new OfflineCommandError({
      code: "VALIDATION_ERROR",
      message: "El comando no coincide con la operacion original",
      retryable: false,
      status: 400,
    });
  }
  console.error("Error en RPC de comando offline", {
    code: error.code,
    details: error.details,
    hint: error.hint,
    message: error.message,
  });
  return new OfflineCommandError({
    code: "RETRYABLE",
    message: `No se pudo sincronizar la preventa${error.code ? ` (${error.code})` : ""}`,
    retryable: true,
    status: 503,
  });
};

export async function executeOfflineCommand(
  command: OfflineCommandV1
): Promise<OfflineCommandResult> {
  const supabase = await createClient();
  const { data: replayData, error: replayError } = await supabase.rpc(
    "get_offline_pre_sale_replay_result",
    { p_command: command }
  );
  if (replayError) {
    throw mapRpcError(replayError);
  }
  const replayResult = replayData?.[0];
  if (replayResult?.sales_order_id) {
    return {
      ok: true,
      commandId: command.commandId,
      resourceId: replayResult.sales_order_id,
      duplicate: true,
    };
  }

  let snapshot: SellerOfflineSnapshotV1;
  try {
    snapshot = await createSellerOfflineSnapshot(command.orgSlugAtCreation);
  } catch (snapshotError) {
    if (snapshotError instanceof SellerOfflineSnapshotError) {
      throw mapSnapshotError(snapshotError);
    }
    throw snapshotError;
  }

  if (
    snapshot.ownerUserId !== command.ownerUserId ||
    snapshot.organizationId !== command.organizationId
  ) {
    throw new OfflineCommandError({
      code: "FORBIDDEN",
      message: "El comando pertenece a otra cuenta u organizacion",
      retryable: false,
      status: 403,
    });
  }

  const changes = findOfflinePreSaleCommercialChanges(command, snapshot);
  if (changes.length > 0) {
    throw new OfflineCommandError({
      changes,
      code: "REVIEW_REQUIRED",
      message: "La preventa tiene cambios comerciales para revisar",
      retryable: false,
      status: 409,
    });
  }

  const adminSupabase = createAdminClient();
  const { data, error: rpcError } = await adminSupabase.rpc(
    "create_offline_pre_sale_atomic",
    {
      p_actor_user_id: command.ownerUserId,
      p_command: command,
    }
  );
  if (rpcError) {
    throw mapRpcError(rpcError);
  }
  const result = data?.[0];
  if (!result?.sales_order_id) {
    throw new OfflineCommandError({
      code: "RETRYABLE",
      message: "El servidor no devolvio la preventa creada",
      retryable: true,
      status: 503,
    });
  }

  return {
    ok: true,
    commandId: command.commandId,
    resourceId: result.sales_order_id,
    duplicate: result.duplicate,
  };
}
