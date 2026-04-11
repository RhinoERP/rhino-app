import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import {
  type ClosePosSessionInput,
  closePosSessionSchema,
  type OpenPosSessionInput,
  openPosSessionSchema,
  type PosCashControlData,
  type PosCashControlTerminal,
  type PosSessionSummary,
} from "../types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type PosSessionWithTerminalRow =
  Database["public"]["Tables"]["pos_sessions"]["Row"] & {
    terminal?: {
      id?: string | null;
      name?: string | null;
      code?: string | null;
      cash_register_number?: number | null;
      is_active?: boolean | null;
    } | null;
  };

type PosPaymentWithSaleRow = {
  amount?: number | null;
  payment_method?:
    | Database["public"]["Tables"]["pos_payments"]["Row"]["payment_method"]
    | null;
  pos_sales?:
    | {
        session_id?: string | null;
      }
    | {
        session_id?: string | null;
      }[]
    | null;
};

type OrganizationMemberWithUser =
  Database["public"]["Functions"]["get_organization_members_with_users"]["Returns"][number];

function getFallbackUserLabel(userId: string) {
  return `Usuario ${userId.slice(0, 8)}`;
}

function sanitizeNotes(value?: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isCashPaymentMethod(
  paymentMethod:
    | Database["public"]["Tables"]["pos_payments"]["Row"]["payment_method"]
    | null
    | undefined
) {
  const normalized = String(paymentMethod ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  return normalized === "cash" || normalized === "efectivo";
}

function resolveCashSessionId(payment: PosPaymentWithSaleRow): string | null {
  const linkedSale = Array.isArray(payment.pos_sales)
    ? payment.pos_sales[0]
    : payment.pos_sales;

  return linkedSale?.session_id ?? null;
}

async function getCurrentUserOrThrow(supabase: SupabaseServerClient) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(
      `No se pudo obtener el usuario autenticado: ${error.message}`
    );
  }

  if (!user?.id) {
    throw new Error("Sesión inválida. Inicia sesión nuevamente.");
  }

  return user;
}

async function getCashTotalsBySessionId(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  sessionIds: string[];
}): Promise<Map<string, number>> {
  const { supabase, orgId, sessionIds } = params;

  if (!sessionIds.length) {
    return new Map<string, number>();
  }

  const { data, error } = await supabase
    .from("pos_payments")
    .select(
      "amount, payment_method, pos_sales!inner(session_id, organization_id)"
    )
    .eq("pos_sales.organization_id", orgId)
    .in("pos_sales.session_id", sessionIds);

  if (error) {
    throw new Error(
      `No se pudo calcular el efectivo de las sesiones POS: ${error.message}`
    );
  }

  const totalsBySession = new Map<string, number>();

  for (const payment of (data ?? []) as PosPaymentWithSaleRow[]) {
    if (!isCashPaymentMethod(payment.payment_method)) {
      continue;
    }

    const sessionId = resolveCashSessionId(payment);

    if (!sessionId) {
      continue;
    }

    const amount = truncateMoney(Number(payment.amount ?? 0));

    totalsBySession.set(
      sessionId,
      truncateMoney((totalsBySession.get(sessionId) ?? 0) + amount)
    );
  }

  return totalsBySession;
}

async function getUserNamesById(params: {
  supabase: SupabaseServerClient;
  orgSlug: string;
  currentUser: {
    id: string;
    email?: string | null;
    user_metadata?: {
      full_name?: string;
      [key: string]: unknown;
    };
  };
}): Promise<Map<string, string>> {
  const { supabase, orgSlug, currentUser } = params;

  const userNamesById = new Map<string, string>();

  const { data: members, error: membersError } = await supabase.rpc(
    "get_organization_members_with_users",
    {
      org_slug_param: orgSlug,
    }
  );

  if (membersError) {
    console.warn(
      `No se pudieron obtener miembros para sesiones POS: ${membersError.message}`
    );
  }

  for (const member of (members ?? []) as OrganizationMemberWithUser[]) {
    if (!member.user_id) {
      continue;
    }

    const displayName =
      member.full_name ?? member.email ?? getFallbackUserLabel(member.user_id);

    userNamesById.set(member.user_id, displayName);
  }

  if (!userNamesById.has(currentUser.id)) {
    userNamesById.set(
      currentUser.id,
      currentUser.user_metadata?.full_name ??
        currentUser.email ??
        getFallbackUserLabel(currentUser.id)
    );
  }

  return userNamesById;
}

function mapSessionSummary(params: {
  session: PosSessionWithTerminalRow;
  cashSalesAmount: number;
  currentUserId: string;
  userNamesById: Map<string, string>;
}): PosSessionSummary {
  const { session, cashSalesAmount, currentUserId, userNamesById } = params;

  const startingCash = truncateMoney(Number(session.starting_cash ?? 0));
  const normalizedCashSalesAmount = truncateMoney(Number(cashSalesAmount ?? 0));
  const expectedCashEnd = truncateMoney(
    startingCash + normalizedCashSalesAmount
  );

  const realCashEnd =
    session.real_cash_end !== null && session.real_cash_end !== undefined
      ? truncateMoney(Number(session.real_cash_end))
      : null;

  let differenceAmount: number | null = null;

  if (realCashEnd !== null) {
    differenceAmount = truncateMoney(realCashEnd - expectedCashEnd);
  } else if (
    session.difference_amount !== null &&
    session.difference_amount !== undefined
  ) {
    differenceAmount = truncateMoney(Number(session.difference_amount));
  }

  return {
    id: session.id,
    terminalId: session.terminal_id,
    terminalName: session.terminal?.name ?? "Terminal sin nombre",
    terminalCode: session.terminal?.code ?? null,
    terminalCashRegisterNumber: session.terminal?.cash_register_number ?? null,
    userId: session.user_id,
    userName:
      userNamesById.get(session.user_id) ??
      getFallbackUserLabel(session.user_id),
    openedAt: session.opened_at,
    closedAt: session.closed_at,
    startingCash,
    cashSalesAmount: normalizedCashSalesAmount,
    expectedCashEnd,
    realCashEnd,
    differenceAmount,
    status: session.status,
    isCurrentUserSession: session.user_id === currentUserId,
  };
}

export async function getOpenPosSessionForUserAndTerminal(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  userId: string;
  terminalId: string;
}) {
  const { supabase, orgId, userId, terminalId } = params;

  const { data, error } = await supabase
    .from("pos_sessions")
    .select("*")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .eq("terminal_id", terminalId)
    .eq(
      "status",
      "OPEN" satisfies Database["public"]["Enums"]["pos_session_status"]
    )
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `No se pudo validar la sesión de caja abierta: ${error.message}`
    );
  }

  return data;
}

export async function getActivePosSessionForUser(params: {
  orgSlug: string;
  terminalId?: string;
}): Promise<PosSessionSummary | null> {
  const { orgSlug, terminalId } = params;
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const currentUser = await getCurrentUserOrThrow(supabase);

  let query = supabase
    .from("pos_sessions")
    .select(
      `
      *,
      terminal:pos_terminals(id, name, code, cash_register_number, is_active)
    `
    )
    .eq("organization_id", org.id)
    .eq("user_id", currentUser.id)
    .eq(
      "status",
      "OPEN" satisfies Database["public"]["Enums"]["pos_session_status"]
    )
    .order("opened_at", { ascending: false })
    .limit(1);

  if (terminalId) {
    query = query.eq("terminal_id", terminalId);
  }

  const { data: session, error } =
    await query.maybeSingle<PosSessionWithTerminalRow>();

  if (error) {
    throw new Error(
      `No se pudo obtener la sesión de caja activa del usuario: ${error.message}`
    );
  }

  if (!session) {
    return null;
  }

  const cashTotalsBySessionId = await getCashTotalsBySessionId({
    supabase,
    orgId: org.id,
    sessionIds: [session.id],
  });

  const userNamesById = new Map<string, string>([
    [
      currentUser.id,
      currentUser.user_metadata?.full_name ??
        currentUser.email ??
        getFallbackUserLabel(currentUser.id),
    ],
  ]);

  return mapSessionSummary({
    session,
    cashSalesAmount: cashTotalsBySessionId.get(session.id) ?? 0,
    currentUserId: currentUser.id,
    userNamesById,
  });
}

export async function getPosCashControlDataByOrgSlug(
  orgSlug: string
): Promise<PosCashControlData> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const currentUser = await getCurrentUserOrThrow(supabase);

  const [sessionsResult, terminalsResult] = await Promise.all([
    supabase
      .from("pos_sessions")
      .select(
        `
        *,
        terminal:pos_terminals(id, name, code, cash_register_number, is_active)
      `
      )
      .eq("organization_id", org.id)
      .order("opened_at", { ascending: false }),
    supabase
      .from("pos_terminals")
      .select("id, name, code, cash_register_number, is_active")
      .eq("organization_id", org.id)
      .order("name", { ascending: true }),
  ]);

  const { data: sessionsData, error: sessionsError } = sessionsResult;
  const { data: terminalsData, error: terminalsError } = terminalsResult;

  if (sessionsError) {
    throw new Error(
      `No se pudieron obtener sesiones de caja POS: ${sessionsError.message}`
    );
  }

  if (terminalsError) {
    throw new Error(
      `No se pudieron obtener terminales POS para caja: ${terminalsError.message}`
    );
  }

  const sessions = (sessionsData ?? []) as PosSessionWithTerminalRow[];

  const [cashTotalsBySessionId, userNamesById] = await Promise.all([
    getCashTotalsBySessionId({
      supabase,
      orgId: org.id,
      sessionIds: sessions.map((session) => session.id),
    }),
    getUserNamesById({
      supabase,
      orgSlug,
      currentUser,
    }),
  ]);

  const sessionSummaries = sessions.map((session) =>
    mapSessionSummary({
      session,
      cashSalesAmount: cashTotalsBySessionId.get(session.id) ?? 0,
      currentUserId: currentUser.id,
      userNamesById,
    })
  );

  const terminals: PosCashControlTerminal[] = (terminalsData ?? []).map(
    (terminal) => ({
      id: terminal.id,
      name: terminal.name,
      code: terminal.code ?? null,
      cashRegisterNumber: terminal.cash_register_number ?? null,
      isActive: terminal.is_active !== false,
    })
  );

  return {
    sessions: sessionSummaries,
    terminals,
  };
}

export async function openPosSession(
  input: OpenPosSessionInput
): Promise<PosSessionSummary> {
  const parsed = openPosSessionSchema.safeParse(input);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      issue?.message ?? "Datos inválidos para abrir la sesión de caja."
    );
  }

  const payload = parsed.data;
  const org = await getOrganizationBySlug(payload.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const currentUser = await getCurrentUserOrThrow(supabase);

  const { data: terminal, error: terminalError } = await supabase
    .from("pos_terminals")
    .select("id, name, code, cash_register_number, is_active")
    .eq("organization_id", org.id)
    .eq("id", payload.terminalId)
    .maybeSingle();

  if (terminalError) {
    throw new Error(
      `No se pudo validar la terminal para la apertura de caja: ${terminalError.message}`
    );
  }

  if (!terminal?.id) {
    throw new Error("La terminal POS seleccionada no existe.");
  }

  if (terminal.is_active === false) {
    throw new Error(
      "La terminal POS está inactiva. Activa la terminal o selecciona otra caja."
    );
  }

  const { data: openSessionForTerminal, error: openSessionForTerminalError } =
    await supabase
      .from("pos_sessions")
      .select("id, user_id")
      .eq("organization_id", org.id)
      .eq("terminal_id", payload.terminalId)
      .eq(
        "status",
        "OPEN" satisfies Database["public"]["Enums"]["pos_session_status"]
      )
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (openSessionForTerminalError) {
    throw new Error(
      `No se pudo validar sesión abierta de la terminal: ${openSessionForTerminalError.message}`
    );
  }

  if (openSessionForTerminal?.id) {
    if (openSessionForTerminal.user_id === currentUser.id) {
      throw new Error(
        "Ya tienes una sesión de caja abierta para esta terminal."
      );
    }

    throw new Error(
      "La terminal ya tiene una sesión de caja abierta por otro usuario."
    );
  }

  const startingCash = truncateMoney(payload.startingCash);

  const { data: createdSession, error: createdSessionError } = await supabase
    .from("pos_sessions")
    .insert({
      organization_id: org.id,
      terminal_id: payload.terminalId,
      user_id: currentUser.id,
      status:
        "OPEN" satisfies Database["public"]["Enums"]["pos_session_status"],
      starting_cash: startingCash,
      cash_sales_amount: 0,
      expected_cash_end: startingCash,
      real_cash_end: null,
      difference_amount: null,
    })
    .select(
      `
      *,
      terminal:pos_terminals(id, name, code, cash_register_number)
    `
    )
    .maybeSingle<PosSessionWithTerminalRow>();

  if (createdSessionError) {
    throw new Error(
      `No se pudo abrir la sesión de caja: ${createdSessionError.message}`
    );
  }

  if (!createdSession) {
    throw new Error("No se pudo recuperar la sesión de caja creada.");
  }

  const userNamesById = new Map<string, string>([
    [
      currentUser.id,
      currentUser.user_metadata?.full_name ??
        currentUser.email ??
        getFallbackUserLabel(currentUser.id),
    ],
  ]);

  return mapSessionSummary({
    session: createdSession,
    cashSalesAmount: 0,
    currentUserId: currentUser.id,
    userNamesById,
  });
}

export async function closePosSession(
  input: ClosePosSessionInput
): Promise<PosSessionSummary> {
  const parsed = closePosSessionSchema.safeParse(input);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      issue?.message ?? "Datos inválidos para cerrar la sesión de caja."
    );
  }

  const payload = parsed.data;
  const org = await getOrganizationBySlug(payload.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const currentUser = await getCurrentUserOrThrow(supabase);

  const { data: session, error: sessionError } = await supabase
    .from("pos_sessions")
    .select(
      `
      *,
      terminal:pos_terminals(id, name, code, cash_register_number)
    `
    )
    .eq("organization_id", org.id)
    .eq("id", payload.sessionId)
    .maybeSingle<PosSessionWithTerminalRow>();

  if (sessionError) {
    throw new Error(
      `No se pudo obtener la sesión de caja para cierre: ${sessionError.message}`
    );
  }

  if (!session) {
    throw new Error("La sesión de caja no existe o fue eliminada.");
  }

  if (session.user_id !== currentUser.id) {
    throw new Error("Solo el usuario que abrió la caja puede cerrarla.");
  }

  if (session.status !== "OPEN") {
    throw new Error("La sesión de caja ya está cerrada.");
  }

  const cashTotalsBySessionId = await getCashTotalsBySessionId({
    supabase,
    orgId: org.id,
    sessionIds: [session.id],
  });

  const startingCash = truncateMoney(Number(session.starting_cash ?? 0));
  const cashSalesAmount = truncateMoney(
    cashTotalsBySessionId.get(session.id) ?? 0
  );
  const expectedCashEnd = truncateMoney(startingCash + cashSalesAmount);
  const realCashEnd = truncateMoney(payload.realCashEnd);
  const differenceAmount = truncateMoney(realCashEnd - expectedCashEnd);

  const { data: closedSession, error: closeError } = await supabase
    .from("pos_sessions")
    .update({
      status:
        "CLOSED" satisfies Database["public"]["Enums"]["pos_session_status"],
      closed_at: new Date().toISOString(),
      real_cash_end: realCashEnd,
      cash_sales_amount: cashSalesAmount,
      expected_cash_end: expectedCashEnd,
      difference_amount: differenceAmount,
      notes: sanitizeNotes(payload.notes),
    })
    .eq("organization_id", org.id)
    .eq("id", session.id)
    .select(
      `
      *,
      terminal:pos_terminals(id, name, code, cash_register_number)
    `
    )
    .maybeSingle<PosSessionWithTerminalRow>();

  if (closeError) {
    throw new Error(
      `No se pudo cerrar la sesión de caja: ${closeError.message}`
    );
  }

  if (!closedSession) {
    throw new Error("No se pudo recuperar la sesión de caja cerrada.");
  }

  const userNamesById = new Map<string, string>([
    [
      currentUser.id,
      currentUser.user_metadata?.full_name ??
        currentUser.email ??
        getFallbackUserLabel(currentUser.id),
    ],
  ]);

  return mapSessionSummary({
    session: closedSession,
    cashSalesAmount,
    currentUserId: currentUser.id,
    userNamesById,
  });
}
