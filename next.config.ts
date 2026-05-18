import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite rutas dinámicas y evita cachear server components críticos como el detalle de venta.
  cacheComponents: false,
  outputFileTracingIncludes: {
    "/org/\\[orgSlug\\]/arca/facturas": [
      "node_modules/@sparticuz/chromium/bin/**/*",
    ],
    "/org/\\[orgSlug\\]/ventas": ["node_modules/@sparticuz/chromium/bin/**/*"],
    "/org/\\[orgSlug\\]/ventas/\\[saleId\\]": [
      "node_modules/@sparticuz/chromium/bin/**/*",
    ],
  },
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
};

export default nextConfig;
