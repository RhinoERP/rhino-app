import { withSentryConfig } from "@sentry/nextjs/config";
import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite rutas dinámicas y evita cachear server components críticos como el detalle de venta.
  cacheComponents: false,
  serverExternalPackages: ["@sparticuz/chromium-min", "puppeteer-core"],
};

export default withSentryConfig(withSerwist(nextConfig), {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
