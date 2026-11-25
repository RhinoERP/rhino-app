import { afterEach, describe, expect, it, vi } from "vitest";
import { AUDIO_MAX_BYTES } from "./config";
import { inspectAudio, readAudioBytes, transcribeAudio } from "./provider";

function wav(seconds: number) {
  const rate = 8000;
  const bytes = new Uint8Array(44 + rate * seconds * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      bytes[offset + i] = value.charCodeAt(i);
    }
  };
  text(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, bytes.length - 44, true);
  return bytes;
}

afterEach(() => vi.unstubAllEnvs());

describe("audio validation and provider boundary", () => {
  it("measures audio from its bytes rather than browser metadata", async () => {
    const audio = await inspectAudio(wav(2));
    expect(audio.durationSeconds).toBe(2);
    expect(audio.mimeType).toBe("audio/wav");
  });

  it("rejects invalid, oversized and overlong audio before a provider call", async () => {
    await expect(inspectAudio(new Uint8Array([1, 2, 3]))).rejects.toMatchObject(
      { code: "AUDIO_FORMAT" }
    );
    await expect(
      inspectAudio(new Uint8Array(AUDIO_MAX_BYTES + 1))
    ).rejects.toMatchObject({ code: "AUDIO_SIZE" });
    await expect(inspectAudio(wav(121))).rejects.toMatchObject({
      code: "AUDIO_DURATION",
    });
  });

  it("caps streamed downloads even when content-length is missing", async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(AUDIO_MAX_BYTES));
          controller.enqueue(new Uint8Array(1));
          controller.close();
        },
      })
    );
    await expect(readAudioBytes(response)).rejects.toMatchObject({
      code: "AUDIO_SIZE",
    });
  });

  it("uses the existing key and multipart language hints without exposing credentials", async () => {
    vi.stubEnv("OPENAI_API_KEY", "private-test-key");
    const request = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) => {
        expect(init?.headers).toEqual({
          Authorization: "Bearer private-test-key",
        });
        const body = init?.body as FormData;
        expect(body.get("model")).toBe("gpt-transcribe");
        expect(body.get("languages[]")).toBe("es");
        expect(body.has("language")).toBe(false);
        expect(body.get("file")).toBeInstanceOf(Blob);
        return Promise.resolve(
          Response.json({
            text: "Quiero dos kilos de queso",
            languages: [{ code: "es" }],
          })
        );
      }
    );
    const result = await transcribeAudio(await inspectAudio(wav(1)), request);
    expect(result.text).toBe("Quiero dos kilos de queso");
    expect(result.languages).toEqual(["es"]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not turn silence or provider diagnostics into a customer request", async () => {
    vi.stubEnv("OPENAI_API_KEY", "private-test-key");
    const audio = await inspectAudio(wav(1));
    await expect(
      transcribeAudio(audio, async () => Response.json({ text: "" }))
    ).rejects.toMatchObject({ code: "AUDIO_EMPTY", retryable: false });
    await expect(
      transcribeAudio(
        audio,
        async () => new Response("secret provider detail", { status: 429 })
      )
    ).rejects.toMatchObject({ code: "AUDIO_PROVIDER", retryable: true });
  });
});
