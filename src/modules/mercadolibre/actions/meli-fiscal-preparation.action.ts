"use server";

import {
  publishMeliFiscalAutomatically,
  saveMeliFiscalAutomaticConfiguration,
  saveMeliFiscalInitialConfiguration,
} from "../service/meli-fiscal-automatic.service";
import {
  getMeliFiscalPreparation,
  inspectMeliFiscalDispatch,
  prepareMeliFiscal,
  publishMeliFiscal,
} from "../service/meli-fiscal-preparation.service";

export async function saveMeliFiscalInitialConfigurationAction(
  orgSlug: string,
  input: unknown
) {
  try {
    const data = await saveMeliFiscalInitialConfiguration(orgSlug, input);
    return { success: true as const, data };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se guardó la configuración.",
    };
  }
}

export async function saveMeliFiscalAutomaticConfigurationAction(
  orgSlug: string,
  origin: unknown,
  assignments: unknown
) {
  try {
    const data = await saveMeliFiscalAutomaticConfiguration(
      orgSlug,
      origin,
      assignments
    );
    return { success: true as const, data };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se guardó la configuración.",
    };
  }
}

export async function retryMeliFiscalAutomaticAction(
  orgSlug: string,
  origin: unknown
) {
  try {
    const data = await publishMeliFiscalAutomatically(orgSlug, origin);
    return { success: true as const, data };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se confirmó la publicación.",
    };
  }
}

export async function getMeliFiscalPreparationAction(
  orgSlug: string,
  origin: unknown
) {
  try {
    return {
      success: true as const,
      data: await getMeliFiscalPreparation(orgSlug, origin),
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "No se pudo consultar.",
    };
  }
}

export async function publishMeliFiscalAction(
  orgSlug: string,
  origin: unknown,
  assignments: unknown
) {
  try {
    const data = await publishMeliFiscal(orgSlug, origin, assignments);
    return { success: true as const, data };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se confirmó la publicación fiscal.",
    };
  }
}

export async function inspectMeliFiscalDispatchAction(
  orgSlug: string,
  origin: unknown
) {
  try {
    return {
      success: true as const,
      data: await inspectMeliFiscalDispatch(orgSlug, origin),
    };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo consultar el envío fiscal.",
    };
  }
}

export async function prepareMeliFiscalAction(
  orgSlug: string,
  origin: unknown,
  attempt: unknown
) {
  try {
    return {
      success: true as const,
      data: await prepareMeliFiscal(orgSlug, origin, attempt),
    };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se confirmó la preparación.",
    };
  }
}
