import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCommercialJobProcessor,
  getMissingCommercialEnvironment,
  isCommercialAgentConfigured,
} from "./commercial-agent";

const required = [
  "WHATSAPP_META_ACCESS_TOKEN",
  "OPENAI_API_KEY",
  "WHATSAPP_AGENT_SERVICE_TOKEN",
  "WHATSAPP_AGENT_RHINOS_URL",
] as const;

describe("worker startup configuration", () => {
  beforeEach(() => {
    for (const name of required) {
      vi.stubEnv(name, "private-value-that-must-not-be-logged");
    }
  });
  afterEach(() => vi.unstubAllEnvs());

  it("allows polling when all required settings are present", () => {
    expect(isCommercialAgentConfigured()).toBe(true);
    expect(getMissingCommercialEnvironment()).toEqual([]);
  });

  it.each(
    required
  )("identifies missing %s without revealing any values", (name) => {
    vi.stubEnv(name, undefined);
    expect(isCommercialAgentConfigured()).toBe(false);
    expect(getMissingCommercialEnvironment()).toEqual([name]);
    expect(JSON.stringify(getMissingCommercialEnvironment())).not.toContain(
      "private-value"
    );
  });

  it("rejects whitespace-only values and lists every missing setting", () => {
    vi.stubEnv("WHATSAPP_AGENT_RHINOS_URL", "  ");
    vi.stubEnv("WHATSAPP_AGENT_SERVICE_TOKEN", "");
    expect(isCommercialAgentConfigured()).toBe(false);
    expect(getMissingCommercialEnvironment()).toEqual([
      "WHATSAPP_AGENT_SERVICE_TOKEN",
      "WHATSAPP_AGENT_RHINOS_URL",
    ]);
  });
});

it.each([
  "UNKNOWN",
  "SENT",
])("reconciles %s delivery before loading a possibly superseded source", async (status) => {
  const db = {
    rpc: vi.fn().mockResolvedValue({ data: { status }, error: null }),
    from: vi.fn(),
  };
  const process = createCommercialJobProcessor(db as unknown as SupabaseClient);
  const result = process({
    id: "job",
    source_message_id: "old-source",
    organization_id: "org",
    integration_id: "integration",
    conversation_id: "conversation",
    lease_token: "lease",
    attempts: 2,
    max_attempts: 5,
    human_delay_applied: true,
  });
  if (status === "UNKNOWN") {
    await expect(result).rejects.toMatchObject({ code: "DELIVERY_REVIEW" });
  } else {
    await expect(result).resolves.toBeUndefined();
  }
  expect(db.from).not.toHaveBeenCalled();
  expect(db.rpc).toHaveBeenCalledWith("recover_whatsapp_outbox", {
    p_job_id: "job",
    p_lease_token: "lease",
  });
});
