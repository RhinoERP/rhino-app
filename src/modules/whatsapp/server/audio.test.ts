import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testDb = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  sign: vi.fn(),
  beforeUpsert: vi.fn(),
  verify: vi.fn(),
  unavailableSchema: false,
}));
vi.mock("./supabase-admin", () => ({
  createWhatsAppAdminClient: () => ({
    from: (table: string) => new Query(table),
    rpc: () => Promise.resolve({ data: 2, error: null }),
    storage: { from: () => ({ createSignedUploadUrl: testDb.sign }) },
  }),
}));
vi.mock("./access", () => ({
  getWhatsAppSandboxAccess: () =>
    Promise.resolve({
      organization: { id: "11111111-1111-4111-8111-111111111111" },
      userId: "actor",
    }),
}));
vi.mock("./simulation", () => ({
  verifyLocalSimulatorSession: testDb.verify,
  createLocalSimulatorSession: vi.fn(),
}));

class Query implements PromiseLike<unknown> {
  private rows: Record<string, unknown>[];
  private missing = false;
  private updateValues: Record<string, unknown> | undefined;
  private readonly table: string;
  constructor(table: string) {
    this.table = table;
    this.rows = [...(testDb.tables[table] ?? [])];
  }
  select(columns: string) {
    this.missing = testDb.unavailableSchema && columns === "cleanup_claimed_at";
    return this;
  }
  eq(key: string, value: unknown) {
    this.rows = this.rows.filter((row) => row[key] === value);
    return this;
  }
  is(key: string, value: unknown) {
    return this.eq(key, value);
  }
  limit(count: number) {
    this.rows = this.rows.slice(0, count);
    return this;
  }
  update(values: Record<string, unknown>) {
    this.updateValues = values;
    return this;
  }
  upsert(row: Record<string, unknown>) {
    testDb.beforeUpsert();
    if (!testDb.tables[this.table].some((existing) => existing.id === row.id)) {
      testDb.tables[this.table].push({
        cleanup_claimed_at: null,
        message_id: null,
        ...row,
      });
    }
    return this;
  }
  maybeSingle() {
    for (const row of this.rows) {
      Object.assign(row, this.updateValues);
    }
    return Promise.resolve({ data: this.rows[0] ?? null, error: null });
  }
  single() {
    return this.maybeSingle();
  }
  // biome-ignore lint/suspicious/noThenProperty: models Supabase's PromiseLike builders.
  then<TResult1 = unknown, TResult2 = never>(
    fulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    rejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({
      data: this.rows,
      error: this.missing ? { code: "42703" } : null,
    }).then(fulfilled, rejected);
  }
}

import {
  audioCapabilities,
  getAudioMessage,
  reserveAudioUpload,
} from "./audio";

const state = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  integrationId: "22222222-2222-4222-8222-222222222222",
  conversationId: "33333333-3333-4333-8333-333333333333",
  customerId: "44444444-4444-4444-8444-444444444444",
};
const request = new NextRequest("http://localhost");
const input = {
  clientMessageId: "55555555-5555-4555-8555-555555555555",
  state,
  mimeType: "audio/mp4",
  size: 100,
};
function reservation(overrides: Record<string, unknown> = {}) {
  return {
    id: input.clientMessageId,
    organization_id: state.organizationId,
    actor_id: "actor",
    integration_id: state.integrationId,
    conversation_id: state.conversationId,
    storage_path: "persisted/audio",
    mime_type: input.mimeType,
    declared_bytes: input.size,
    cleanup_claimed_at: null,
    message_id: null,
    ...overrides,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  testDb.unavailableSchema = false;
  vi.stubEnv("WHATSAPP_AUDIO_ENABLED", "true");
  vi.stubEnv("OPENAI_API_KEY", "test");
  testDb.tables = {
    organizations: [
      { id: state.organizationId, whatsapp_sandbox_audio_enabled: true },
    ],
    whatsapp_audio_assets: [],
    whatsapp_audio_uploads: [],
    whatsapp_conversations: [
      {
        id: state.conversationId,
        organization_id: state.organizationId,
        customer_id: state.customerId,
      },
    ],
  };
  testDb.beforeUpsert.mockReset();
  testDb.sign.mockImplementation((path) =>
    Promise.resolve({ data: { path, token: "test" }, error: null })
  );
});
afterEach(() => vi.unstubAllEnvs());

describe("sandbox audio upload capabilities", () => {
  it("returns a safe transcription failure without provider diagnostics or job ID", async () => {
    const id = input.clientMessageId;
    testDb.tables.whatsapp_audio_assets = [
      {
        message_id: id,
        organization_id: state.organizationId,
        conversation_id: state.conversationId,
        integration_id: state.integrationId,
        status: "FAILED",
        error_message: "private provider response",
        storage_path: "private object key",
      },
    ];
    testDb.tables.whatsapp_messages = [
      { id, organization_id: state.organizationId, content: null },
    ];
    testDb.tables.agent_jobs = [
      {
        id: "private job ID",
        source_message_id: id,
        job_type: "TRANSCRIBE_AUDIO",
        status: "FAILED",
        last_error: "private job diagnostics",
      },
    ];
    const result = await getAudioMessage("demo", id, request);
    expect(result).toMatchObject({
      messageId: id,
      status: "FAILED",
      error: "No se pudo transcribir este audio.",
    });
    expect(result).not.toHaveProperty("jobId");
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("requires the corrective migration before enabling audio", async () => {
    testDb.unavailableSchema = true;
    await expect(
      audioCapabilities(state.organizationId)
    ).resolves.toMatchObject({ ready: false, needsMigration: true });
  });
  it("renews the persisted reservation before issuing a two-hour upload capability", async () => {
    testDb.sign.mockImplementation((path) => {
      const row = testDb.tables.whatsapp_audio_uploads[0];
      expect(Date.parse(String(row.expires_at))).toBeGreaterThan(
        Date.now() + 124 * 60_000
      );
      return Promise.resolve({ data: { path, token: "test" }, error: null });
    });
    await expect(
      reserveAudioUpload("demo", input, request)
    ).resolves.toMatchObject({
      uploadId: input.clientMessageId,
      state,
    });
  });
  it.each([
    { actor_id: "other-actor" },
    { conversation_id: "66666666-6666-4666-8666-666666666666" },
  ])("never signs a capability when another reservation wins a concurrent upsert: %j", async (other) => {
    testDb.beforeUpsert.mockImplementation(() => {
      testDb.tables.whatsapp_audio_uploads.push(reservation(other));
    });
    await expect(reserveAudioUpload("demo", input, request)).rejects.toThrow(
      "otra sesión"
    );
    expect(testDb.sign).not.toHaveBeenCalled();
  });
  it.each([
    { cleanup_claimed_at: new Date().toISOString() },
    { message_id: "completed" },
  ])("does not reopen a completed or retiring upload: %j", async (overrides) => {
    testDb.tables.whatsapp_audio_uploads.push(reservation(overrides));
    await expect(reserveAudioUpload("demo", input, request)).rejects.toThrow(
      "completada o pertenece"
    );
    expect(testDb.sign).not.toHaveBeenCalled();
  });
});
