import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  AUDIO_BUCKET,
  AUDIO_MAX_BYTES,
  AUDIO_MIGRATION,
  AudioError,
  audioEnabled,
  transcriptionModel,
} from "../../../../services/whatsapp-agent/src/audio/config";
import { processAudioJob } from "../../../../services/whatsapp-agent/src/audio/jobs";
import {
  claimJob,
  executeJob,
} from "../../../../services/whatsapp-agent/src/jobs";
import {
  createLocalSimulatorSession,
  type SimulationState,
  verifyLocalSimulatorSession,
} from "./simulation";
import { createWhatsAppAdminClient } from "./supabase-admin";

export const audioStateSchema = z
  .object({
    organizationId: z.uuid(),
    integrationId: z.uuid(),
    conversationId: z.uuid(),
    customerId: z.uuid(),
  })
  .strict();
export const uploadSchema = z
  .object({
    clientMessageId: z.uuid(),
    state: audioStateSchema.optional(),
    customerId: z.uuid().optional(),
    priceListId: z.uuid().optional(),
    mimeType: z.string().min(1).max(100),
    size: z.number().int().positive().max(AUDIO_MAX_BYTES),
  })
  .strict();

export async function audioContext(orgSlug: string) {
  await ensure("whatsapp.read", orgSlug, "whatsapp_sandbox");
  await ensure("whatsapp.manage", orgSlug, "whatsapp_sandbox");
  const [organization, auth] = await Promise.all([
    getOrganizationBySlug(orgSlug),
    (await createClient()).auth.getUser(),
  ]);
  if (!(organization && auth.data.user)) {
    throw new AudioError(
      "AUDIO_ACCESS",
      "Iniciá sesión en esta organización.",
      403
    );
  }
  return {
    organization,
    actorId: auth.data.user.id,
    db: createWhatsAppAdminClient(),
  };
}

function audioSetupMessage(
  needsMigration: boolean,
  enabled: boolean
): string | null {
  if (needsMigration) {
    return `Falta aplicar la migración ${AUDIO_MIGRATION}.`;
  }
  if (!audioEnabled()) {
    return "Configurá WHATSAPP_AUDIO_ENABLED=true en el servidor.";
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return "Falta configurar OPENAI_API_KEY en el servidor.";
  }
  if (!enabled) {
    return "Habilitá los audios de este sandbox para empezar.";
  }
  return null;
}

export async function audioCapabilities(organizationId: string) {
  const db = createWhatsAppAdminClient();
  const [org, schema, uploads, protocol] = await Promise.all([
    db
      .from("organizations")
      .select("whatsapp_sandbox_audio_enabled")
      .eq("id", organizationId)
      .single(),
    db.from("whatsapp_audio_assets").select("message_id").limit(0),
    db.from("whatsapp_audio_uploads").select("cleanup_claimed_at").limit(0),
    db.rpc("whatsapp_worker_protocol_version"),
  ]);
  const needsMigration = Boolean(
    org.error ||
      schema.error ||
      uploads.error ||
      protocol.error ||
      protocol.data !== 2
  );
  return {
    ready:
      !needsMigration &&
      audioEnabled() &&
      Boolean(process.env.OPENAI_API_KEY?.trim()) &&
      org.data?.whatsapp_sandbox_audio_enabled === true,
    needsMigration,
    migration: AUDIO_MIGRATION,
    enabled: org.data?.whatsapp_sandbox_audio_enabled === true,
    configured: audioEnabled() && Boolean(process.env.OPENAI_API_KEY?.trim()),
    model: transcriptionModel(),
    message: audioSetupMessage(
      needsMigration,
      org.data?.whatsapp_sandbox_audio_enabled === true
    ),
  };
}

export async function assertAudioReady(organizationId: string): Promise<void> {
  const capability = await audioCapabilities(organizationId);
  if (!capability.ready) {
    throw new AudioError(
      capability.needsMigration ? "AUDIO_MIGRATION" : "AUDIO_CONFIGURATION",
      capability.message || "Los audios no están disponibles.",
      503
    );
  }
}

async function resolveUploadState(
  input: z.infer<typeof uploadSchema>,
  state: SimulationState | undefined,
  organizationId: string,
  actorId: string
): Promise<SimulationState> {
  if (state) {
    if (state.organizationId !== organizationId) {
      throw new AudioError(
        "AUDIO_SESSION",
        "La sesión pertenece a otra organización.",
        403
      );
    }
    await verifyLocalSimulatorSession(state, actorId);
    return state;
  }
  if (!(input.customerId && input.priceListId)) {
    throw new AudioError(
      "AUDIO_SELECTION",
      "Elegí un cliente y una lista de precios."
    );
  }
  return createLocalSimulatorSession({
    organizationId,
    actorId,
    customerId: input.customerId,
    priceListId: input.priceListId,
    conversationId: input.clientMessageId,
  });
}

type UploadReservation = {
  conversation_id: string;
  integration_id: string;
  storage_path: string;
  mime_type: string;
  declared_bytes: number;
  cleanup_claimed_at: string | null;
  message_id: string | null;
};

function validateUploadReservation(
  row: UploadReservation | null,
  state: SimulationState,
  input: z.infer<typeof uploadSchema>
) {
  if (
    !row ||
    row.conversation_id !== state.conversationId ||
    row.integration_id !== state.integrationId ||
    row.mime_type !== input.mimeType ||
    row.declared_bytes !== input.size ||
    row.cleanup_claimed_at ||
    row.message_id
  ) {
    throw new AudioError(
      "AUDIO_UPLOAD_CONFLICT",
      "La carga ya fue completada o pertenece a otra sesión. Adjuntá un audio nuevo.",
      409
    );
  }
  return row;
}

function throwUploadReservationError(error: { code?: string } | null) {
  if (!error) {
    return;
  }
  if (error.code === "54000") {
    throw new AudioError(
      "AUDIO_UPLOAD_QUOTA",
      "Se alcanzó el límite diario de cargas de audio de esta organización.",
      429
    );
  }
  throw new Error("No se pudo preparar la carga.");
}

export async function reserveAudioUpload(orgSlug: string, raw: unknown) {
  const input = uploadSchema.parse(raw);
  const { organization, actorId, db } = await audioContext(orgSlug);
  await assertAudioReady(organization.id);
  const existing = await db
    .from("whatsapp_audio_uploads")
    .select("*")
    .eq("id", input.clientMessageId)
    .eq("organization_id", organization.id)
    .eq("actor_id", actorId)
    .maybeSingle();
  if (existing.error) {
    throw new Error("No se pudo consultar la carga.");
  }
  let state = input.state;
  if (existing.data) {
    if (
      input.state &&
      input.state.conversationId !== existing.data.conversation_id
    ) {
      throw new AudioError(
        "AUDIO_UPLOAD_CONFLICT",
        "La carga pertenece a otra sesión.",
        409
      );
    }
    const conversation = await db
      .from("whatsapp_conversations")
      .select("customer_id")
      .eq("id", existing.data.conversation_id)
      .eq("organization_id", organization.id)
      .single();
    if (!conversation.data?.customer_id) {
      throw new AudioError(
        "AUDIO_SESSION",
        "La sesión no está disponible.",
        404
      );
    }
    state = {
      organizationId: organization.id,
      integrationId: existing.data.integration_id,
      conversationId: existing.data.conversation_id,
      customerId: conversation.data.customer_id,
    };
  }
  state = await resolveUploadState(input, state, organization.id, actorId);

  const storagePath = `${organization.id}/${state.conversationId}/${input.clientMessageId}/audio`;
  if (!existing.data) {
    const inserted = await db.from("whatsapp_audio_uploads").upsert(
      {
        id: input.clientMessageId,
        organization_id: organization.id,
        integration_id: state.integrationId,
        conversation_id: state.conversationId,
        actor_id: actorId,
        storage_path: storagePath,
        mime_type: input.mimeType,
        declared_bytes: input.size,
      },
      { onConflict: "id", ignoreDuplicates: true }
    );
    throwUploadReservationError(inserted.error);
  }
  // Re-read the row that actually won the upsert before issuing any capability.
  const persisted = await db
    .from("whatsapp_audio_uploads")
    .select("*")
    .eq("id", input.clientMessageId)
    .eq("organization_id", organization.id)
    .eq("actor_id", actorId)
    .single();
  if (persisted.error) {
    throw new Error("No se pudo consultar la carga persistida.");
  }
  const reservation = validateUploadReservation(persisted.data, state, input);
  const renewed = await db
    .from("whatsapp_audio_uploads")
    .update({ expires_at: new Date(Date.now() + 125 * 60_000).toISOString() })
    .eq("id", input.clientMessageId)
    .eq("organization_id", organization.id)
    .eq("actor_id", actorId)
    .is("cleanup_claimed_at", null)
    .is("message_id", null)
    .select("id")
    .single();
  if (renewed.error || !renewed.data) {
    throw new AudioError(
      "AUDIO_UPLOAD_EXPIRED",
      "La carga venció. Volvé a adjuntar el audio."
    );
  }
  const { data, error } = await db.storage
    .from(AUDIO_BUCKET)
    .createSignedUploadUrl(reservation.storage_path, { upsert: false });
  if (error || !data) {
    throw new AudioError(
      "AUDIO_STORAGE",
      "No se pudo preparar el almacenamiento privado.",
      502,
      true
    );
  }
  return {
    uploadId: input.clientMessageId,
    state,
    bucket: AUDIO_BUCKET,
    path: data.path,
    token: data.token,
  };
}

export async function getAudioMessage(orgSlug: string, id: string) {
  z.uuid().parse(id);
  const { organization, actorId, db } = await audioContext(orgSlug);
  const result = await db
    .from("whatsapp_audio_assets")
    .select("*")
    .eq("message_id", id)
    .eq("organization_id", organization.id)
    .single();
  if (result.error || !result.data) {
    throw new AudioError(
      "AUDIO_NOT_FOUND",
      "No se encontró el audio de esta sesión.",
      404
    );
  }
  const asset = result.data;
  const conversation = await db
    .from("whatsapp_conversations")
    .select("customer_id")
    .eq("id", asset.conversation_id)
    .eq("organization_id", organization.id)
    .single();
  if (!conversation.data?.customer_id) {
    throw new AudioError(
      "AUDIO_NOT_FOUND",
      "La sesión no está disponible.",
      404
    );
  }
  const state: SimulationState = {
    organizationId: organization.id,
    integrationId: asset.integration_id,
    conversationId: asset.conversation_id,
    customerId: conversation.data.customer_id,
  };
  await verifyLocalSimulatorSession(state, actorId);
  const [message, job] = await Promise.all([
    db
      .from("whatsapp_messages")
      .select("content")
      .eq("id", id)
      .eq("organization_id", organization.id)
      .single(),
    db
      .from("agent_jobs")
      .select("id,status,last_error,available_at")
      .eq("source_message_id", id)
      .eq("job_type", "TRANSCRIBE_AUDIO")
      .single(),
  ]);
  if (message.error || job.error) {
    throw new Error("No se pudo consultar el estado de transcripción.");
  }
  return {
    messageId: id,
    state,
    status: asset.status,
    transcript: message.data?.content || null,
    error: asset.error_message || job.data?.last_error || null,
    retryable: job.data?.status === "RETRY",
    jobStatus: job.data?.status,
    availableAt: job.data?.available_at,
    jobId: job.data?.id as string,
    db,
  };
}

export async function completeAudioUpload(orgSlug: string, uploadId: string) {
  z.uuid().parse(uploadId);
  const { actorId, organization, db } = await audioContext(orgSlug);
  await assertAudioReady(organization.id);
  const reservation = await db
    .from("whatsapp_audio_uploads")
    .select("id")
    .eq("id", uploadId)
    .eq("organization_id", organization.id)
    .eq("actor_id", actorId)
    .single();
  if (reservation.error || !reservation.data) {
    throw new AudioError(
      "AUDIO_NOT_FOUND",
      "La carga no pertenece a esta sesión.",
      404
    );
  }
  const completed = await db.rpc("complete_whatsapp_audio_upload", {
    p_upload_id: uploadId,
    p_actor_id: actorId,
  });
  if (completed.error || !completed.data) {
    throw new AudioError(
      "AUDIO_UPLOAD",
      "No se pudo confirmar el archivo. Verificá la carga y la migración de audios."
    );
  }
  let result = await getAudioMessage(orgSlug, completed.data as string);
  if (result.status !== "SUCCEEDED" && result.status !== "FAILED") {
    const job = await claimJob(db, "TRANSCRIBE_AUDIO", {
      workerId: `sandbox-${randomUUID()}`,
      jobId: result.jobId,
      mode: "INLINE",
    });
    if (!job) {
      throw new AudioError(
        "AUDIO_BUSY",
        "La transcripción está procesándose. Volvé a consultar en unos segundos.",
        409,
        true
      );
    }
    try {
      await executeJob(db, job, (item) => processAudioJob(db, item));
    } catch {
      // Persisted job state is returned; never expose provider diagnostics.
    }
    result = await getAudioMessage(orgSlug, completed.data as string);
  }
  const { db: _db, ...response } = result;
  return response;
}
