export const AUDIO_MAX_BYTES = 4_000_000;
export const AUDIO_MAX_SECONDS = 120;
export const AUDIO_MAX_TEXT = 12_000;
export const AUDIO_BUCKET = "whatsapp-audio";
export const AUDIO_MIGRATION = "20261104010000_whatsapp_audio_review_fixes.sql";

export class AudioError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: string, message: string, status = 422, retryable = false) {
    super(message);
    this.name = "AudioError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function transcriptionModel(): string {
  return (
    process.env.WHATSAPP_AGENT_TRANSCRIPTION_MODEL?.trim() || "gpt-transcribe"
  );
}

export function audioEnabled(): boolean {
  return process.env.WHATSAPP_AUDIO_ENABLED === "true";
}

export function positiveInteger(
  value: string | undefined,
  fallback: number,
  maximum = 32
): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}
