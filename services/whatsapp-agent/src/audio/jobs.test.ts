import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processAudioJob } from "./jobs";

const provider = vi.hoisted(() => ({
  inspect: vi.fn(),
  transcribe: vi.fn(),
  read: vi.fn(),
}));
vi.mock("./provider.ts", () => ({
  inspectAudio: provider.inspect,
  transcribeAudio: provider.transcribe,
  readAudioBytes: provider.read,
}));
const job = {
  id: "job",
  organization_id: "org",
  integration_id: "integration",
  conversation_id: "conversation",
  source_message_id: "message",
  attempts: 1,
  max_attempts: 5,
  human_delay_applied: false,
  job_type: "TRANSCRIBE_AUDIO" as const,
  lease_token: "lease",
};
function database({ status = "PENDING", stored = true } = {}) {
  const asset = {
    message_id: "message",
    status,
    stored,
    sha256: null,
    media_id: "123",
    storage_path: "private/audio",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: asset, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Network unavailable" },
    }),
  };
  return {
    from: vi.fn().mockReturnValue(query),
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    query,
    storage: {
      from: vi.fn(() => ({
        download: vi
          .fn()
          .mockResolvedValue({ data: new Blob(["audio"]), error: null }),
      })),
    },
  };
}

describe("transcription admission and recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WHATSAPP_AUDIO_ENABLED", "true");
    vi.stubEnv("WHATSAPP_META_ACCESS_TOKEN", "test-token");
    provider.inspect.mockResolvedValue({
      bytes: new Uint8Array([1]),
      mimeType: "audio/mp4",
      extension: "m4a",
      durationSeconds: 2,
    });
    provider.transcribe.mockResolvedValue({
      text: "Quiero queso",
      model: "test",
      requestId: "request",
      latencyMs: 1,
    });
    provider.read.mockResolvedValue(new Uint8Array([1]));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("enforces provider quota before copying Meta media into Storage", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ url: "https://lookaside.fbsbx.com/audio" })
        )
    );
    const db = database({ stored: false });
    db.query.maybeSingle.mockResolvedValue({
      data: { phone_number_id: "123456" },
      error: null,
    });
    db.rpc.mockResolvedValue({ data: false, error: null });
    await expect(
      processAudioJob(db as unknown as SupabaseClient, job)
    ).rejects.toMatchObject({ code: "AUDIO_QUOTA" });
    expect(db.storage.from).not.toHaveBeenCalled();
    expect(provider.transcribe).not.toHaveBeenCalled();
  });

  it.each([
    "reserve_whatsapp_audio_usage",
    "assert_whatsapp_audio_job",
  ])("retries transient %s failures before making a paid call", async (failedRpc) => {
    const db = database();
    db.rpc.mockImplementation((name) =>
      Promise.resolve(
        name === failedRpc
          ? { data: null, error: { message: "Network unavailable" } }
          : { data: true, error: null }
      )
    );
    await expect(
      processAudioJob(db as unknown as SupabaseClient, job)
    ).rejects.toMatchObject({ retryable: true });
    expect(provider.transcribe).not.toHaveBeenCalled();
  });

  it("does not call the provider when a lease is lost during audio staging", async () => {
    const db = database();
    db.rpc.mockImplementation((name) =>
      Promise.resolve({
        data: name !== "validate_whatsapp_audio_asset",
        error: null,
      })
    );
    await expect(
      processAudioJob(db as unknown as SupabaseClient, job)
    ).rejects.toThrow("validación");
    expect(db.rpc.mock.calls.map(([name]) => name)).toEqual([
      "reserve_whatsapp_audio_usage",
      "assert_whatsapp_audio_job",
      "validate_whatsapp_audio_asset",
    ]);
    expect(provider.transcribe).not.toHaveBeenCalled();
  });

  it("retries an integration lookup outage rather than permanently discarding the audio", async () => {
    await expect(
      processAudioJob(
        database({ stored: false }) as unknown as SupabaseClient,
        job
      )
    ).rejects.toMatchObject({ retryable: true });
    expect(provider.transcribe).not.toHaveBeenCalled();
  });

  it("can terminate a disabled job without a provider call so text is unblocked", async () => {
    vi.stubEnv("WHATSAPP_AUDIO_ENABLED", "false");
    await expect(
      processAudioJob(database() as unknown as SupabaseClient, job)
    ).rejects.toMatchObject({ code: "AUDIO_DISABLED", retryable: false });
    expect(provider.transcribe).not.toHaveBeenCalled();
  });

  it("recovers completion without retranscribing an already saved result", async () => {
    await expect(
      processAudioJob(
        database({ status: "SUCCEEDED" }) as unknown as SupabaseClient,
        job
      )
    ).resolves.toBeUndefined();
    expect(provider.transcribe).not.toHaveBeenCalled();
  });
});
