import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

const gitRevision = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf-8",
}).stdout.trim();

const revision = gitRevision || crypto.randomUUID();

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
