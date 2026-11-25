import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin-client";
import {
  type CaiActivation,
  type CaiOperation,
  type CaiSettings,
  caiActivationSchema,
  caiAuthorizationSchema,
  caiOperationSchema,
  caiSettingsSchema,
  parseCaiExpiration,
} from "../cai";
import { sanitizeArcaErrorMessage } from "../errors";
import { validateOrganizationCuit } from "../validation";
import { getCurrentUserOrganizationArcaAccess } from "./access";
import { createArcaAutomationClient } from "./client-factory";

const CAI_PATTERN = /^\d{14}$/;
const MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;

async function access(orgSlug: string) {
  const current = await getCurrentUserOrganizationArcaAccess(orgSlug);
  if (!current.canManage) {
    throw new Error(
      "Necesitás permisos de administrador para gestionar los CAI."
    );
  }
  return current;
}

function assertQuery(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

const settingsRowSchema = z.object({
  organization_id: z.uuid(),
  cuit: z.string(),
  enabled: z.boolean(),
  mode: caiSettingsSchema.shape.mode,
  login_cuit: z.string(),
  point_of_sale: z.number(),
  business_name: z.string(),
  address: z.string(),
  vat_condition: z.string(),
  gross_income: z.string(),
  activity_start: z.string(),
});

async function loadSettings(organizationId: string) {
  const result = await createAdminClient()
    .from("remittance_fiscal_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  assertQuery(result.error);
  return result.data ? settingsRowSchema.parse(result.data) : null;
}

export async function getCaiSummary(orgSlug: string) {
  const { organization } = await access(orgSlug);
  const db = createAdminClient();
  const [settings, authorizations, operations] = await Promise.all([
    loadSettings(organization.id),
    db
      .from("remittance_cai_authorizations")
      .select("*")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false }),
    db
      .from("remittance_cai_operations")
      .select("*")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  assertQuery(authorizations.error);
  assertQuery(operations.error);
  return {
    cuit: organization.cuit,
    settings: settings
      ? ({
          enabled: settings.enabled,
          mode: settings.mode,
          loginCuit: settings.login_cuit,
          pointOfSale: settings.point_of_sale,
          businessName: settings.business_name,
          address: settings.address,
          vatCondition: settings.vat_condition,
          grossIncome: settings.gross_income,
          activityStart: settings.activity_start,
        } satisfies CaiSettings)
      : null,
    authorizations: z.array(caiAuthorizationSchema).parse(authorizations.data),
    operations: z.array(caiOperationSchema).parse(operations.data),
  };
}
export type CaiSummary = Awaited<ReturnType<typeof getCaiSummary>>;

export async function saveCaiSettings(orgSlug: string, input: CaiSettings) {
  const { organization } = await access(orgSlug);
  validateOrganizationCuit(organization.cuit);
  const parsed = caiSettingsSchema.parse(input);
  validateOrganizationCuit(parsed.loginCuit);
  const result = await createAdminClient().rpc(
    "save_remittance_fiscal_settings",
    { p_org_id: organization.id, p_settings: parsed }
  );
  assertQuery(result.error);
}

export async function activateCai(orgSlug: string, input: CaiActivation) {
  const { organization, userId } = await access(orgSlug);
  const result = await createAdminClient().rpc("activate_remittance_cai", {
    p_org_id: organization.id,
    p_data: { ...caiActivationSchema.parse(input), activatedBy: userId },
  });
  assertQuery(result.error);
}

export async function importCai(
  orgSlug: string,
  input: { cai: string; expiresAt: string }
) {
  const { organization, userId } = await access(orgSlug);
  const settings = await loadSettings(organization.id);
  if (!settings) {
    throw new Error("Guardá los datos fiscales antes de cargar un CAI.");
  }
  const parsed = z
    .object({
      cai: z.string().regex(CAI_PATTERN, "El CAI debe tener 14 dígitos."),
      expiresAt: z.iso.date(),
    })
    .parse(input);
  const result = await createAdminClient()
    .from("remittance_cai_authorizations")
    .insert({
      organization_id: organization.id,
      created_by: userId,
      cuit: settings.cuit,
      point_of_sale: settings.point_of_sale,
      mode: settings.mode,
      cai: parsed.cai,
      expires_at: parsed.expiresAt,
    });
  assertQuery(result.error);
}

const automationResponse = z.object({
  id: z.string().min(1),
  status: z.string(),
  data: z.unknown().optional(),
});

/** Persist only documented non-secret result fields. Never retain provider request payloads or errors. */
export function parseCaiAutomationResult(
  operation: Pick<CaiOperation, "kind" | "params">,
  value: unknown
) {
  if (operation.kind === "request") {
    const result = z
      .object({
        status: z.literal("requested"),
        cai: z.string().regex(CAI_PATTERN),
        vencimiento: z.string(),
        solicitud: z.string().optional(),
        comprobantes: z
          .array(
            z.object({
              puntoVenta: z.coerce.number().int(),
              tipoComprobante: z.coerce.number().int(),
              cantidad: z.coerce.number().int(),
            })
          )
          .min(1),
      })
      .parse(value);
    const requested = z
      .array(
        z.object({
          puntoVenta: z.number(),
          tipoComprobante: z.number(),
          cantidad: z.number(),
        })
      )
      .parse(operation.params.comprobantes);
    if (
      result.comprobantes.length !== 1 ||
      requested.length !== 1 ||
      result.comprobantes[0].puntoVenta !== requested[0].puntoVenta ||
      result.comprobantes[0].tipoComprobante !== 91 ||
      result.comprobantes[0].cantidad <= 0 ||
      result.comprobantes[0].cantidad > requested[0].cantidad
    ) {
      throw new Error(
        "La respuesta de ARCA no corresponde a los comprobantes solicitados. Revisá la constancia."
      );
    }
    return {
      status: result.status,
      cai: result.cai,
      expiresAt: parseCaiExpiration(result.vencimiento),
      solicitud: result.solicitud ?? "",
      quantity: result.comprobantes[0].cantidad,
    };
  }
  const status =
    operation.kind === "validate"
      ? z
          .literal("validated")
          .parse(z.object({ status: z.string() }).parse(value).status)
      : z
          .enum(
            operation.kind === "cancel"
              ? ["cancelled", "already_cancelled"]
              : ["cancellable", "already_cancelled"]
          )
          .parse(z.object({ status: z.string() }).parse(value).status);
  if (operation.kind !== "validate") {
    const result = z.object({ cai: z.string() }).parse(value);
    if (result.cai !== operation.params.cai) {
      throw new Error("El resultado no corresponde al CAI solicitado.");
    }
  }
  return { status };
}

async function applyResponse(
  organizationId: string,
  operation: CaiOperation,
  response: unknown
) {
  const parsed = automationResponse.parse(response);
  if (operation.provider_id && operation.provider_id !== parsed.id) {
    throw new Error("La respuesta pertenece a otra automatización.");
  }
  const db = createAdminClient();
  const update = await db
    .from("remittance_cai_operations")
    .update({ provider_id: parsed.id, state: "pending", error: null })
    .eq("id", operation.id)
    .eq("organization_id", organizationId)
    .in("state", ["starting", "pending", "uncertain"])
    .select("id");
  assertQuery(update.error);
  if (!update.data?.length) {
    return;
  }
  if (parsed.status === "complete") {
    const result = parseCaiAutomationResult(operation, parsed.data);
    const completed = await db.rpc("complete_remittance_cai_operation", {
      p_org_id: organizationId,
      p_id: operation.id,
      p_result: result,
    });
    assertQuery(completed.error);
  } else if (["failed", "error"].includes(parsed.status)) {
    // Provider failure can happen after ARCA processed the request. Require reconciliation.
    const failed = await db
      .from("remittance_cai_operations")
      .update({
        state: "uncertain",
        error:
          "La automatización no pudo confirmar el resultado. Revisá ARCA antes de iniciar otro trámite.",
      })
      .eq("id", operation.id)
      .eq("organization_id", organizationId)
      .neq("state", "complete");
    assertQuery(failed.error);
  }
}

export async function startCaiOperation(
  orgSlug: string,
  input: {
    requestKey: string;
    kind: CaiOperation["kind"];
    quantity?: number;
    authorizationId?: string;
  }
) {
  const current = await access(orgSlug);
  const parsed = z
    .object({
      requestKey: z.uuid(),
      kind: caiOperationSchema.shape.kind,
      quantity: z.number().int().min(1).max(99_999_999).optional(),
      authorizationId: z.uuid().optional(),
    })
    .parse(input);
  const settings = await loadSettings(current.organization.id);
  if (!settings) {
    throw new Error("Primero guardá los datos fiscales y el CUIT de acceso.");
  }
  const params: Record<
    string,
    | string
    | number
    | boolean
    | Array<{ puntoVenta: number; tipoComprobante: number; cantidad: number }>
  > = {
    cuit: settings.cuit,
    username: settings.login_cuit,
    validateOnly: ["validate", "check_cancel"].includes(parsed.kind),
  };
  if (["validate", "request"].includes(parsed.kind)) {
    if (!parsed.quantity) {
      throw new Error("Indicá la cantidad solicitada.");
    }
    params.comprobantes = [
      {
        puntoVenta: settings.point_of_sale,
        tipoComprobante: 91,
        cantidad: parsed.quantity,
      },
    ];
    params.resguardo = false;
  } else {
    const auth = await createAdminClient()
      .from("remittance_cai_authorizations")
      .select("*")
      .eq("organization_id", current.organization.id)
      .eq("id", parsed.authorizationId)
      .single();
    assertQuery(auth.error);
    const authorization = caiAuthorizationSchema.parse(auth.data);
    params.cai = authorization.cai;
  }
  // Initializing the client first prevents a missing access token from creating an ambiguous operation.
  const client = createArcaAutomationClient("prod");
  const db = createAdminClient();
  const started = await db.rpc("begin_remittance_cai_operation", {
    p_org_id: current.organization.id,
    p_actor_id: current.userId,
    p_key: parsed.requestKey,
    p_kind: parsed.kind,
    p_params: params,
  });
  assertQuery(started.error);
  const operation = caiOperationSchema.parse(started.data);
  // Compare-and-set claims the operation once, including concurrent duplicate action calls.
  const claimed = await db
    .from("remittance_cai_operations")
    .update({ state: "pending" })
    .eq("id", operation.id)
    .eq("organization_id", current.organization.id)
    .eq("state", "starting")
    .select("id");
  assertQuery(claimed.error);
  if (!claimed.data?.length) {
    return;
  }
  try {
    const response: unknown = await client.CreateAutomation(
      parsed.kind === "validate" || parsed.kind === "request"
        ? "cai-request"
        : "cai-cancel",
      params,
      false
    );
    await applyResponse(current.organization.id, operation, response);
  } catch (error) {
    const missingCredential = sanitizeArcaErrorMessage(error).includes(
      "arca_credential_required"
    );
    const failure = await db
      .from("remittance_cai_operations")
      .update({
        state: missingCredential ? "failed" : "uncertain",
        error: missingCredential
          ? "Guardá la clave fiscal de este CUIT en el proyecto de AFIP SDK y volvé a validar."
          : "No se pudo confirmar el resultado. Consultá el intento o conciliá con la constancia de ARCA; no repitas la solicitud.",
      })
      .eq("id", operation.id)
      .eq("organization_id", current.organization.id)
      .neq("state", "complete");
    assertQuery(failure.error);
  }
}

export async function refreshCaiOperation(
  orgSlug: string,
  operationId: string
) {
  const { organization } = await access(orgSlug);
  const result = await createAdminClient()
    .from("remittance_cai_operations")
    .select("*")
    .eq("organization_id", organization.id)
    .eq("id", z.uuid().parse(operationId))
    .single();
  assertQuery(result.error);
  const operation = caiOperationSchema.parse(result.data);
  if (operation.state === "complete" || operation.state === "failed") {
    return;
  }
  if (!operation.provider_id) {
    throw new Error(
      "No se recibió el identificador del proveedor. Conciliá el intento con ARCA."
    );
  }
  const response: unknown = await createArcaAutomationClient(
    "prod"
  ).GetAutomationDetails(operation.provider_id, false);
  await applyResponse(organization.id, operation, response);
}

export async function reconcileCaiOperation(
  orgSlug: string,
  input: {
    operationId: string;
    outcome: "not_applied" | "requested" | "cancelled";
    cai: string;
    expiresAt: string;
    evidence: string;
  }
) {
  const { organization } = await access(orgSlug);
  const parsed = z
    .object({
      operationId: z.uuid(),
      outcome: z.enum(["not_applied", "requested", "cancelled"]),
      cai: z.string(),
      expiresAt: z.string(),
      evidence: z
        .string()
        .trim()
        .min(10, "Describí la comprobación realizada en ARCA.")
        .max(500),
    })
    .parse(input);
  const db = createAdminClient();
  const result = await db
    .from("remittance_cai_operations")
    .select("*")
    .eq("organization_id", organization.id)
    .eq("id", parsed.operationId)
    .single();
  assertQuery(result.error);
  const operation = caiOperationSchema.parse(result.data);
  if (!["starting", "pending", "uncertain"].includes(operation.state)) {
    throw new Error("El intento ya está resuelto.");
  }
  if (
    operation.state !== "uncertain" &&
    Date.now() - new Date(operation.created_at).getTime() < 10 * 60 * 1000
  ) {
    throw new Error(
      "El trámite sigue en curso. Consultá el resultado antes de conciliarlo."
    );
  }
  if (parsed.outcome === "not_applied") {
    const update = await db
      .from("remittance_cai_operations")
      .update({
        state: "failed",
        error: "Conciliado: el trámite no se aplicó en ARCA.",
        result: { evidence: parsed.evidence },
      })
      .eq("id", operation.id)
      .eq("organization_id", organization.id)
      .in("state", ["starting", "pending", "uncertain"]);
    assertQuery(update.error);
    return;
  }
  const cai = z.string().regex(CAI_PATTERN).parse(parsed.cai);
  if (parsed.outcome === "requested" && operation.kind !== "request") {
    throw new Error("Este intento no corresponde a una solicitud de CAI.");
  }
  if (
    parsed.outcome === "cancelled" &&
    (operation.kind !== "cancel" || operation.params.cai !== cai)
  ) {
    throw new Error("La anulación no corresponde a este intento.");
  }
  const update = await db.rpc("complete_remittance_cai_operation", {
    p_org_id: organization.id,
    p_id: operation.id,
    p_result: {
      status: parsed.outcome,
      cai,
      ...(parsed.outcome === "requested"
        ? { expiresAt: z.iso.date().parse(parsed.expiresAt) }
        : {}),
      evidence: parsed.evidence,
    },
  });
  assertQuery(update.error);
}

export async function getCaiUsageReport(orgSlug: string, month: string) {
  const { organization } = await access(orgSlug);
  const parsed = z.string().regex(MONTH_PATTERN).parse(month);
  const [year, number] = parsed.split("-").map(Number);
  const end = `${number === 12 ? year + 1 : year}-${String(number === 12 ? 1 : number + 1).padStart(2, "0")}-01`;
  const result = await createAdminClient()
    .from("order_remittances")
    .select("document_number, issue_date, status, header_snapshot")
    .eq("organization_id", organization.id)
    .gte("issue_date", `${parsed}-01`)
    .lt("issue_date", end)
    .order("document_number")
    .limit(10_001);
  assertQuery(result.error);
  const rows = z
    .array(
      z.object({
        document_number: z.string(),
        issue_date: z.string(),
        status: z.string(),
        header_snapshot: z.object({
          remittance: z.object({
            fiscal: z
              .object({
                cai: z.string(),
                pointOfSale: z.number(),
                number: z.number(),
              })
              .optional(),
          }),
        }),
      })
    )
    .parse(result.data);
  if (rows.length > 10_000) {
    throw new Error(
      "El período supera los 10.000 documentos. Solicitá una exportación ampliada."
    );
  }
  return rows.flatMap((row) =>
    row.header_snapshot.remittance.fiscal
      ? [
          {
            date: row.issue_date,
            documentNumber: row.document_number,
            status: row.status,
            ...row.header_snapshot.remittance.fiscal,
          },
        ]
      : []
  );
}
