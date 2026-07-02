import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../src/index";

const app = createApp();

function normalizeRequestUrl(req: VercelRequest): void {
  const url = req.url ?? "/";
  if (url === "/api") {
    req.url = "/";
    return;
  }
  if (url.startsWith("/api/")) {
    req.url = url.slice(4) || "/";
  }
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  normalizeRequestUrl(req);
  app(req, res);
}
