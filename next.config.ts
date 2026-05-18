import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite rutas dinámicas y evita cachear server components críticos como el detalle de venta.
  cacheComponents: false,
  outputFileTracingIncludes: {
    "/*": ["node_modules/@sparticuz/chromium/bin/**/*"],
  },
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
};

export default nextConfig;
