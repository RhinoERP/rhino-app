import type { ChartOfAccount } from "../../db/types";
import type {
  CreateCuentaInput,
  UpdateCuentaInput,
} from "../../schemas/libros.schema";
import { AppError } from "../../utils/errors";
import {
  createCuenta,
  getCuentaById,
  listCuentas,
  updateCuenta,
} from "./accounts.queries";

export function listCuentasService(
  orgId: string,
  soloActivas: boolean
): Promise<ChartOfAccount[]> {
  return listCuentas(orgId, soloActivas);
}

export function createCuentaService(
  input: CreateCuentaInput
): Promise<ChartOfAccount> {
  return createCuenta({
    org_id: input.orgId,
    codigo: input.codigo,
    nombre: input.nombre,
    account_code: input.accountCode ?? null,
    tipo: input.tipo,
    naturaleza: input.naturaleza,
    permite_movimientos: input.permiteMovimientos,
    padre_id: input.padreId ?? null,
  });
}

export async function updateCuentaService(
  id: string,
  input: UpdateCuentaInput
): Promise<ChartOfAccount> {
  const existing = await getCuentaById(id);
  if (!existing) {
    throw AppError.notFound(`Cuenta ${id} no encontrada`);
  }

  const updated = await updateCuenta(id, {
    ...(input.codigo !== undefined && { codigo: input.codigo }),
    ...(input.nombre !== undefined && { nombre: input.nombre }),
    ...(input.accountCode !== undefined && { account_code: input.accountCode }),
    ...(input.tipo !== undefined && { tipo: input.tipo }),
    ...(input.naturaleza !== undefined && { naturaleza: input.naturaleza }),
    ...(input.permiteMovimientos !== undefined && {
      permite_movimientos: input.permiteMovimientos,
    }),
    ...(input.padreId !== undefined && { padre_id: input.padreId }),
    ...(input.activa !== undefined && { activa: input.activa }),
  });

  if (!updated) {
    throw AppError.notFound(`Cuenta ${id} no encontrada`);
  }

  return updated;
}
