"use server";

import { createAdminClient } from "@/lib/supabase/admin-client";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type InvitationLookupResponse = {
  active: boolean;
  organization_name: string;
  invited_email: string | null;
};

type AcceptInvitationResponse =
  Database["public"]["Functions"]["accept_organization_invitation"]["Returns"];

type SignupInput = {
  token: string;
  fullName: string;
  password: string;
  passwordConfirm: string;
};

type ActionResult<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export async function acceptInvitationLoggedIn(
  token: string
): Promise<ActionResult<AcceptInvitationResponse>> {
  if (!token) {
    return { ok: false, error: "Falta el token de invitación." };
  }

  const supabaseServer = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabaseServer.auth.getUser();

  if (userError) {
    return { ok: false, error: "No se pudo obtener el usuario actual." };
  }

  if (!user) {
    return { ok: false, error: "No hay usuario autenticado." };
  }

  const supabaseAdmin = createAdminClient();

  const { data: acceptData, error: acceptError } = await supabaseAdmin.rpc(
    "accept_organization_invitation",
    {
      lookup_invitation_token: token,
      p_user_id: user.id,
    }
  );

  if (acceptError) {
    return {
      ok: false,
      error: acceptError.message ?? "No se pudo aceptar la invitación.",
    };
  }

  const result = acceptData as AcceptInvitationResponse;

  return { ok: true, data: result };
}

export async function acceptInvitationWithSignup(
  input: SignupInput
): Promise<ActionResult<AcceptInvitationResponse>> {
  const { token, fullName, password, passwordConfirm } = input;

  if (!token) {
    return { ok: false, error: "Falta el token de invitación." };
  }

  if (!(fullName && password && passwordConfirm)) {
    return { ok: false, error: "Faltan datos requeridos." };
  }

  if (password.length < 8) {
    return {
      ok: false,
      error: "La contraseña debe tener al menos 8 caracteres.",
    };
  }

  if (password !== passwordConfirm) {
    return { ok: false, error: "Las contraseñas no coinciden." };
  }

  const supabaseAdmin = createAdminClient();

  const { data: inviteInfo, error: inviteError } = await supabaseAdmin.rpc(
    "lookup_organization_invitation",
    {
      p_token: token,
    }
  );

  if (inviteError) {
    return { ok: false, error: "Error al validar la invitación." };
  }

  const invitation = (inviteInfo ?? null) as InvitationLookupResponse | null;

  if (!invitation || invitation.active === false || !invitation.invited_email) {
    return {
      ok: false,
      error: "La invitación es inválida o ha expirado.",
    };
  }

  const invitedEmail = invitation.invited_email;

  const { data: userRes, error: userError } =
    await supabaseAdmin.auth.admin.createUser({
      email: invitedEmail,
      password,
      user_metadata: {
        full_name: fullName,
      },
      email_confirm: true,
    });

  if (userError || !userRes?.user) {
    return {
      ok: false,
      error:
        userError?.message ??
        "No se pudo crear el usuario para esta invitación.",
    };
  }

  const userId = userRes.user.id;

  const { data: acceptData, error: acceptError } = await supabaseAdmin.rpc(
    "accept_organization_invitation",
    {
      lookup_invitation_token: token,
      p_user_id: userId,
    }
  );

  if (acceptError) {
    return {
      ok: false,
      error: acceptError.message ?? "No se pudo aceptar la invitación.",
    };
  }

  const result = acceptData as AcceptInvitationResponse;

  return { ok: true, data: result };
}
