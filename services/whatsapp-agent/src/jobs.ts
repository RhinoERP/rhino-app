import type { SupabaseClient } from "@supabase/supabase-js";
import { AudioError } from "./audio/config.ts";
import type { AgentJob, AgentJobProcessor } from "./worker.js";

export type JobType = "TRANSCRIBE_AUDIO" | "PROCESS_CONVERSATION";
export type LeasedJob = AgentJob & {
  job_type: JobType;
  execution_mode: "INLINE" | "DAEMON";
  lease_token: string;
  lease_expires_at: string;
};

export async function claimJob(
  db: SupabaseClient,
  type: JobType,
  options: {
    workerId: string;
    jobId?: string;
    mode?: "INLINE" | "DAEMON";
    capacity?: number;
  }
): Promise<LeasedJob | null> {
  const { data, error } = await db.rpc("claim_whatsapp_job_v2", {
    p_worker_id: options.workerId,
    p_job_type: type,
    p_execution_mode: options.mode || "DAEMON",
    p_job_id: options.jobId || null,
    p_capacity: options.capacity || 8,
  });
  if (error) {
    throw new Error(
      `No se pudo reclamar el trabajo: ${error.code || "database"}`
    );
  }
  return (Array.isArray(data) ? data[0] : data) || null;
}

export async function executeJob(
  db: SupabaseClient,
  job: LeasedJob,
  process: AgentJobProcessor
): Promise<void> {
  let lost = false;
  const timer = setInterval(() => {
    db.rpc("renew_whatsapp_job_lease", {
      p_job_id: job.id,
      p_lease_token: job.lease_token,
    }).then(({ data: renewed, error: renewError }) => {
      if (renewError || !renewed) {
        lost = true;
      }
    });
  }, 30_000);
  timer.unref();
  let failure: unknown;
  let deferUntil: string | undefined;
  try {
    if (job.attempts > job.max_attempts) {
      throw new AudioError(
        "JOB_ATTEMPTS",
        "Se agotaron los intentos del trabajo."
      );
    }
    const result = await process(job);
    if (result) {
      deferUntil = result.deferUntil;
    }
  } catch (error) {
    failure = error;
  } finally {
    clearInterval(timer);
  }
  if (lost) {
    throw new Error(
      "El trabajo perdió su exclusión; no se confirmó el resultado."
    );
  }
  let errorMessage: string | null = null;
  if (failure) {
    errorMessage =
      failure instanceof Error ? failure.message : "Error procesando trabajo";
  }
  const { data: finished, error: finishError } = await db.rpc(
    "finish_whatsapp_job_v2",
    {
      p_job_id: job.id,
      p_lease_token: job.lease_token,
      p_succeeded: !failure,
      p_error: errorMessage,
      p_retryable: failure instanceof AudioError ? failure.retryable : true,
      p_defer_until: deferUntil || null,
    }
  );
  if (finishError || !finished) {
    throw new Error(
      "No se pudo confirmar el trabajo; se recuperará desde la cola."
    );
  }
  if (failure) {
    throw failure;
  }
}

export function leased(job: AgentJob): LeasedJob {
  if (!("lease_token" in job) || typeof job.lease_token !== "string") {
    throw new Error("Falta la exclusión del trabajo.");
  }
  return job as LeasedJob;
}
