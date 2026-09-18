import { captureMessage } from "@sentry/nextjs";

export type PwaEvent =
  | "pwa.app_installed"
  | "pwa.install_banner_dismissed"
  | "pwa.install_banner_shown"
  | "pwa.install_prompt_accepted"
  | "pwa.install_prompt_available"
  | "pwa.install_prompt_dismissed"
  | "pwa.ios_instructions_shown"
  | "pwa.offline_fallback_retry"
  | "pwa.offline_fallback_shown"
  | "pwa.service_worker_controlling"
  | "pwa.service_worker_register_failed"
  | "pwa.service_worker_waiting"
  | "pwa.update_accepted";

export function trackPwaEvent(event: PwaEvent) {
  captureMessage(event, {
    level: "info",
    tags: { feature: "pwa" },
  });
}
