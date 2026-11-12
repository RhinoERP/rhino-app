import { randomUUID } from "node:crypto";
import { createSerwistRoute } from "@serwist/turbopack";

// Public HTML references build-specific chunks. A local rebuild without a git
// commit must refresh these documents too; otherwise they retain old chunk URLs.
const revision = randomUUID();

const serviceWorkerRoute = createSerwistRoute({
  additionalPrecacheEntries: [
    // public/offline.html is already discovered and content-hashed by Serwist.
    // Adding it here with another revision aborts worker installation.
    { url: "/~offline", revision },
    { url: "/~offline/datos", revision },
    { url: "/~offline/borradores", revision },
    { url: "/~offline/preventa", revision },
    { url: "/~offline/cotizaciones", revision },
  ],
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
});

export const { dynamic, dynamicParams, revalidate, generateStaticParams } =
  serviceWorkerRoute;

export function GET(...args: Parameters<typeof serviceWorkerRoute.GET>) {
  // Browsers check for updates even without a new register() call. Do not let a
  // dev server replace an installed production worker with an empty precache.
  if (process.env.NODE_ENV !== "production") {
    return new Response("Para probar offline, ejecutá pnpm pwa:serve", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return serviceWorkerRoute.GET(...args);
}
