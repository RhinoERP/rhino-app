import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
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
