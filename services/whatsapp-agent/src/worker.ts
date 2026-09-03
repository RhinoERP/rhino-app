import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type AgentJob = {
  id: string;
  organization_id: string;
  integration_id: string;
  conversation_id: string;
  source_message_id: string;
  attempts: number;
  max_attempts: number;
};

export type AgentJobProcessor = (job: AgentJob) => Promise<void>;

export type WhatsAppWorkerOptions = {
  workerId: string;
  supabase: SupabaseClient;
  process: AgentJobProcessor;
};

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Error desconocido procesando trabajo";
}

export function retryDelaySeconds(attempt: number): number {
  // 5, 10, 20, 40, 80 segundos; el máximo de intentos lo aplica la RPC.
  return Math.min(5 * 2 ** Math.max(attempt - 1, 0), 5 * 60);
}

export class WhatsAppWorker {
  private readonly options: WhatsAppWorkerOptions;

  constructor(options: WhatsAppWorkerOptions) {
    this.options = options;
  }

  async runOnce(): Promise<boolean> {
    const { data, error: claimError } = await this.options.supabase.rpc(
      "claim_whatsapp_agent_job",
      {
        p_worker_id: this.options.workerId,
      }
    );
    if (claimError) {
      throw new Error(`No se pudo reclamar un trabajo: ${claimError.message}`);
    }

    const job = (Array.isArray(data) ? data[0] : data) as AgentJob | null;
    if (!job) {
      return false;
    }

    try {
      await this.options.process(job);
    } catch (processError) {
      const { error: retryError } = await this.options.supabase.rpc(
        "finish_whatsapp_agent_job",
        {
          p_job_id: job.id,
          p_worker_id: this.options.workerId,
          p_succeeded: false,
          p_error: errorMessage(processError),
          p_retry_after_seconds: retryDelaySeconds(job.attempts),
        }
      );
      if (retryError) {
        throw new Error(
          `No se pudo programar el reintento: ${retryError.message}`
        );
      }
      return true;
    }

    const { error: finishError } = await this.options.supabase.rpc(
      "finish_whatsapp_agent_job",
      {
        p_job_id: job.id,
        p_worker_id: this.options.workerId,
        p_succeeded: true,
      }
    );
    if (finishError) {
      throw new Error(
        `No se pudo completar el trabajo: ${finishError.message}`
      );
    }

    return true;
  }
}

export function createWorkerSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!(url && serviceKey)) {
    throw new Error("Faltan las credenciales de Supabase del worker");
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
