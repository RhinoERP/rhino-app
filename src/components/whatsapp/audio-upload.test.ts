import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestAudio, uploadAudioFile } from "./audio-upload";

const { upload } = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: { from: () => ({ uploadToSignedUrl: upload }) },
  }),
}));

describe("sandbox upload retries", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          uploadId: "upload",
          bucket: "whatsapp-audio",
          path: "private/audio",
          token: "test",
          state: { conversationId: "conversation" },
        })
      )
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [{ statusCode: "400", message: "Invalid MIME type" }, false],
    [{ statusCode: "400", message: "The resource already exists" }, true],
    [{ statusCode: "409", message: "Conflict" }, true],
    [{ statusCode: "503", message: "Unavailable" }, false],
  ])("only accepts actual duplicate upload errors: %j", async (error, duplicate) => {
    upload.mockResolvedValue({ error });
    const result = uploadAudioFile({
      base: "/audio",
      file: new File(["audio"], "audio.m4a", { type: "audio/mp4" }),
      clientMessageId: "upload",
      state: undefined,
      customerId: "customer",
      priceListId: "list",
      onSessionReady: vi.fn(),
    });
    if (duplicate) {
      await expect(result).resolves.toMatchObject({ uploadId: "upload" });
    } else {
      await expect(result).rejects.toThrow("No se pudo subir");
    }
  });

  it("handles a redirected HTML login page without exposing parser errors", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("<html>login</html>"));
    await expect(requestAudio("/audio")).rejects.toThrow(
      "No se pudo procesar el audio"
    );
  });
});
