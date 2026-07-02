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
  if (req.url?.startsWith("/debug")) {
    res.status(200).json({ url: req.url, method: req.method });
    return;
  }
  app(req, res);
}
