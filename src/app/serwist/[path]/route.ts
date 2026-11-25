import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

// Keep the revision stable across requests while refreshing the offline pages
// when a new build is published.
const revision =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.BUILD_ID ||
  process.env.NEXT_BUILD_ID ||
  spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf-8",
  }).stdout.trim() ||
  process.env.npm_package_version ||
  "rhinos-pwa-build-v1";

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
