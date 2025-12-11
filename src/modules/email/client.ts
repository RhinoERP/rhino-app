import { Resend } from "resend";

/**
 * Creates and returns a Resend client instance
 * Throws an error if RESEND_API_KEY is not configured
 */
export function createResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is not configured. Please set it in your environment variables."
    );
  }

  return new Resend(apiKey);
}
