import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { AudioError } from "./audio/config";
import { executeJob, type LeasedJob } from "./jobs";

const job = {
  id: "job",
  organization_id: "org",
  conversation_id: "conversation",
  integration_id: "integration",
  source_message_id: "message",
  job_type: "TRANSCRIBE_AUDIO",
  execution_mode: "INLINE",
  lease_token: "current-token",
  lease_expires_at: new Date(Date.now() + 180_000).toISOString(),
  attempts: 1,
  max_attempts: 5,
  human_delay_applied: false,
} satisfies LeasedJob;

describe("leased execution", () => {
  it("persists terminal validation failures rather than retrying a paid request", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    await expect(
      executeJob({ rpc } as unknown as SupabaseClient, job, () =>
        Promise.reject(new AudioError("AUDIO_SIZE", "Muy grande", 413))
      )
    ).rejects.toThrow("Muy grande");
    expect(rpc).toHaveBeenCalledWith(
      "finish_whatsapp_job_v2",
      expect.objectContaining({
        p_succeeded: false,
        p_retryable: false,
        p_lease_token: "current-token",
      })
    );
  });

  it("does not call a processor after the maximum attempts are exhausted", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const process = vi.fn();
    await expect(
      executeJob(
        { rpc } as unknown as SupabaseClient,
        { ...job, attempts: 6 },
        process
      )
    ).rejects.toMatchObject({ code: "JOB_ATTEMPTS" });
    expect(process).not.toHaveBeenCalled();
  });

  it("does not acknowledge completion with a stale lease", async () => {
    const rpc = vi.fn(async () => ({ data: false, error: null }));
    await expect(
      executeJob(
        { rpc } as unknown as SupabaseClient,
        job,
        vi.fn().mockResolvedValue(undefined)
      )
    ).rejects.toThrow("recuperará");
  });
});
