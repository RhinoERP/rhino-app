import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseServerClient } from "@/lib/supabase/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createDocumentSignedUrl } from "./documents-storage.service";

describe("createDocumentSignedUrl", () => {
  const createSignedUrl = vi.fn();
  const from = vi.fn(() => ({ createSignedUrl }));
  const client = { storage: { from } } as unknown as SupabaseServerClient;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a five-minute URL for the canonical object path", async () => {
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://project.supabase.co/signed" },
      error: null,
    });

    await expect(
      createDocumentSignedUrl(
        "https://project.supabase.co/storage/v1/object/public/documents/acme/sale/remittos/file.pdf?v=1",
        client
      )
    ).resolves.toBe("https://project.supabase.co/signed");

    expect(from).toHaveBeenCalledWith("documents");
    expect(createSignedUrl).toHaveBeenCalledWith(
      "acme/sale/remittos/file.pdf",
      300
    );
  });

  it("does not hide authorization errors returned by Storage", async () => {
    createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "Unauthorized" },
    });

    await expect(
      createDocumentSignedUrl("acme/sale/remittos/file.pdf", client)
    ).rejects.toThrow("Unauthorized");
  });
});
