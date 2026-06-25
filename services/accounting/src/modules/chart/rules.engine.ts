import Decimal from "decimal.js";
import type { AnyEvento } from "../../schemas/eventos.schema";
import {
  evaluateFormula,
  getNestedValue,
  safeStr,
  toDecimal,
} from "../../utils/decimal";
import { AppError } from "../../utils/errors";
import { resolveAccountFull } from "../accounts/accounts.queries";
import { loadRulesWithLines } from "./rules.queries";
import type {
  PreviewResponse,
  ResolvedLine,
  RuleWithLines,
} from "./rules.types";

// ------------------------------------------------------------
// Tipo interno para las líneas desglosadas del payload
// ------------------------------------------------------------
type LineaDesglosada = {
  accountCode: string | null;
  montoNeto: string;
  montoImpuestos?: string;
};

// ------------------------------------------------------------
// matchesCondicion: verifica si la condición JSONB de una regla
// aplica al evento recibido (compara contra event.datos).
// null = catch-all, siempre aplica.
// ------------------------------------------------------------
function matchesCondicion(condicion: unknown, event: AnyEvento): boolean {
  if (condicion === null || condicion === undefined) {
    return true;
  }
  if (typeof condicion !== "object") {
    return false;
  }

  const datos = (event as { datos: Record<string, unknown> }).datos;
  for (const [key, value] of Object.entries(
    condicion as Record<string, unknown>
  )) {
    if (datos[key] !== value) {
      return false;
    }
  }
  return true;
}

// ------------------------------------------------------------
// Helper: resuelve la línea impositiva de un EXPAND
// ------------------------------------------------------------
async function resolveImpLine(
  lado: "DEBE" | "HABER",
  montoImpuestos: string,
  orgId: string
): Promise<ResolvedLine> {
  const impAccountCode =
    lado === "HABER" ? "IVA_DEBITO_FISCAL" : "IVA_CREDITO_FISCAL";
  const impCuenta = await resolveAccountFull(impAccountCode, orgId);
  if (impCuenta === null) {
    throw new AppError(
      `Cuenta no encontrada para account_code '${impAccountCode}'. Configure el plan de cuentas antes de registrar el asiento.`,
      422
    );
  }
  return {
    lado,
    monto: montoImpuestos,
    cuentaId: impCuenta.id,
    cuentaCodigo: impAccountCode,
    cuentaCodigoInterno: impCuenta.codigo,
    cuentaNombre: impCuenta.nombre,
    esSeleccionable: false,
    opcionesCuenta: null,
    pendienteImputacion: false,
  };
}

async function resolveExpandedNetLine(
  linea: LineaDesglosada,
  lado: "DEBE" | "HABER",
  orgId: string
): Promise<ResolvedLine> {
  if (linea.accountCode === null) {
    return {
      lado,
      monto: linea.montoNeto,
      cuentaId: null,
      cuentaCodigo: null,
      cuentaCodigoInterno: null,
      cuentaNombre: null,
      esSeleccionable: false,
      opcionesCuenta: null,
      pendienteImputacion: true,
    };
  }

  const cuenta = await resolveAccountFull(linea.accountCode, orgId);
  if (cuenta === null) {
    throw new AppError(
      `Cuenta no encontrada para account_code '${linea.accountCode}'. Configure el plan de cuentas antes de registrar el asiento.`,
      422
    );
  }

  return {
    lado,
    monto: linea.montoNeto,
    cuentaId: cuenta.id,
    cuentaCodigo: linea.accountCode,
    cuentaCodigoInterno: cuenta.codigo,
    cuentaNombre: cuenta.nombre,
    esSeleccionable: false,
    opcionesCuenta: null,
    pendienteImputacion: false,
  };
}

// ------------------------------------------------------------
// Procesa la fórmula EXPAND: para líneas desglosadas
// Genera una línea neta + una línea IVA_DEBITO_FISCAL por cada item
// ------------------------------------------------------------
async function expandLineas(
  path: string,
  lado: "DEBE" | "HABER",
  event: AnyEvento,
  orgId: string
): Promise<ResolvedLine[]> {
  const raw = getNestedValue(event, path);
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }

  const lineas = raw as LineaDesglosada[];
  const resolved: ResolvedLine[] = [];

  for (const linea of lineas) {
    resolved.push(await resolveExpandedNetLine(linea, lado, orgId));

    const montoImp = toDecimal(linea.montoImpuestos);
    if (linea.montoImpuestos && montoImp.greaterThan(0)) {
      resolved.push(await resolveImpLine(lado, linea.montoImpuestos, orgId));
    }
  }

  return resolved;
}

// ------------------------------------------------------------
// Helper: resuelve una línea no-seleccionable por account_code
// ------------------------------------------------------------
async function resolveAccountLine(
  line: RuleWithLines["lines"][number],
  monto: Decimal,
  orgId: string
): Promise<ResolvedLine> {
  const cuenta = line.account_code
    ? await resolveAccountFull(line.account_code, orgId)
    : null;

  if (cuenta === null) {
    throw new AppError(
      `Cuenta no encontrada para account_code '${line.account_code}'. Configure el plan de cuentas antes de registrar el asiento.`,
      422
    );
  }

  return {
    lado: line.lado,
    monto: safeStr(monto),
    cuentaId: cuenta.id,
    cuentaCodigo: line.account_code ?? null,
    cuentaCodigoInterno: cuenta.codigo,
    cuentaNombre: cuenta.nombre,
    esSeleccionable: false,
    opcionesCuenta: null,
    pendienteImputacion: false,
  };
}

// ------------------------------------------------------------
// Resuelve las líneas de una regla contra el evento
// ------------------------------------------------------------
async function resolveRuleLines(
  rule: RuleWithLines,
  event: AnyEvento
): Promise<ResolvedLine[]> {
  const resolved: ResolvedLine[] = [];
  const orgId = event.orgId;

  for (const line of rule.lines) {
    if (line.formula.startsWith("EXPAND:")) {
      const path = line.formula.slice(7).trim();
      resolved.push(...(await expandLineas(path, line.lado, event, orgId)));
      continue;
    }

    const monto = evaluateFormula(line.formula, event);
    if (monto.isZero()) {
      continue;
    }

    if (line.es_seleccionable) {
      resolved.push({
        lado: line.lado,
        monto: safeStr(monto),
        cuentaId: null,
        cuentaCodigo: null,
        cuentaCodigoInterno: null,
        cuentaNombre: null,
        esSeleccionable: true,
        opcionesCuenta: line.opciones_cuenta ?? null,
        pendienteImputacion: false,
      });
    } else {
      resolved.push(await resolveAccountLine(line, monto, orgId));
    }
  }

  return resolved;
}

// ------------------------------------------------------------
// Calcula totales y estado de imputación.
// ------------------------------------------------------------
function summarize(lineas: ResolvedLine[]): PreviewResponse {
  let debeTotal = new Decimal(0);
  let haberTotal = new Decimal(0);

  for (const l of lineas) {
    if (l.lado === "DEBE") {
      debeTotal = debeTotal.plus(toDecimal(l.monto));
    } else {
      haberTotal = haberTotal.plus(toDecimal(l.monto));
    }
  }

  return {
    estadoImputacion: lineas.some((l) => l.pendienteImputacion || !l.cuentaId)
      ? "SUSPENSO"
      : "COMPLETO",
    lineas,
    debeTotal: safeStr(debeTotal),
    haberTotal: safeStr(haberTotal),
  };
}

// ------------------------------------------------------------
// resolveEvent — punto de entrada principal
// Recibe cualquier AnyEvento y retorna PreviewResponse
// ------------------------------------------------------------
export async function resolveEvent(event: AnyEvento): Promise<PreviewResponse> {
  const rules = await loadRulesWithLines(event.orgId, event.tipoEvento);

  // Sin reglas configuradas → error
  if (rules.length === 0) {
    throw new AppError(
      `No hay reglas contables configuradas para el evento '${event.tipoEvento}'. Configure las reglas antes de registrar el asiento.`,
      422
    );
  }

  // Encontrar la primera regla que aplica (ordenadas por prioridad DESC)
  const rule = rules.find((r) => matchesCondicion(r.condicion, event));

  // Sin regla que aplique → error
  if (!rule) {
    throw new AppError(
      `Ninguna regla contable aplica al evento '${event.tipoEvento}' con las condiciones dadas. Configure las reglas antes de registrar el asiento.`,
      422
    );
  }

  const lineas = await resolveRuleLines(rule, event);
  return summarize(lineas);
}
