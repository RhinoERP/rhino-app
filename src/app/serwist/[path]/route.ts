import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

// Resolve a stable build identifier at build time; never generate a revision
// per route-handler instance/request (which makes every SW look updated).
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

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    additionalPrecacheEntries: [
      { url: "/~offline", revision },
      { url: "/~offline/datos", revision },
      { url: "/~offline/borradores", revision },
      { url: "/~offline/preventa", revision },
    ],
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
  });
