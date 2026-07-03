import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../src/index";

const app = createApp();
const LEADING_SLASHES_RE = /^\/+/;

function getPathParam(req: VercelRequest): string {
  const rawPath = req.query.path;
  const path = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;

  if (typeof path !== "string") {
    return "";
  }

  const normalizedPath = path.replace(LEADING_SLASHES_RE, "");
  if (normalizedPath === "api") {
    return "";
  }
  if (normalizedPath.startsWith("api/")) {
    return normalizedPath.slice(4);
  }

  return normalizedPath;
}

function buildQueryString(req: VercelRequest): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(req.query)) {
    if (key === "path") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        searchParams.append(key, item);
      }
      continue;
    }

    if (typeof value === "string") {
      searchParams.set(key, value);
    }
  }

  return searchParams.toString();
}

function normalizeRequestUrl(req: VercelRequest): void {
  const path = getPathParam(req);
  const queryString = buildQueryString(req);
  req.url = `/${path}${queryString ? `?${queryString}` : ""}`;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  normalizeRequestUrl(req);
  app(req, res);
}
