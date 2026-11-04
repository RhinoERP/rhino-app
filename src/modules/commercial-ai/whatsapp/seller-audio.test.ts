import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { SellerAudioError, transcribeSellerAudio } = await import(
  "./seller-audio"
);

const payload = {
  audio: { id: "123456", mime_type: "audio/ogg; codecs=opus" },
};

function stubFetch(transcription: Response) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith("https://graph.facebook.com/")) {
        return Promise.resolve(
          Response.json({ url: "https://lookaside.fbsbx.com/whatsapp/audio" })
        );
      }
      if (url.startsWith("https://lookaside.fbsbx.com/")) {
        return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
      }
      return Promise.resolve(transcription);
    })
  );
  return calls;
}

describe("transcribeSellerAudio", () => {
  beforeEach(() => {
    vi.stubEnv("WHATSAPP_META_ACCESS_TOKEN", "token-de-prueba");
    vi.stubEnv("OPENAI_API_KEY", "clave-de-prueba");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("baja el audio de Meta y devuelve el texto transcripto", async () => {
    const calls = stubFetch(
      Response.json({ text: " Pasé por El Obrero, pidieron 20 kilos " })
    );
    await expect(transcribeSellerAudio(payload, "999")).resolves.toBe(
      "Pasé por El Obrero, pidieron 20 kilos"
    );
    expect(calls[0]).toContain("/123456?phone_number_id=999");
    expect(calls[2]).toBe("https://api.openai.com/v1/audio/transcriptions");
  });

  it("explica al vendedor si no se pudo transcribir", async () => {
    stubFetch(new Response("error", { status: 500 }));
    await expect(transcribeSellerAudio(payload, "999")).rejects.toBeInstanceOf(
      SellerAudioError
    );
  });

  it("rechaza referencias de audio inválidas sin llamar a nadie", async () => {
    const calls = stubFetch(Response.json({ text: "x" }));
    await expect(
      transcribeSellerAudio({ audio: { id: "../otro" } }, "999")
    ).rejects.toBeInstanceOf(SellerAudioError);
    expect(calls).toHaveLength(0);
  });
});
