import type { NextRequest } from "next/server";
import { handleRequestProxy } from "./src/lib/request-proxy";

export async function proxy(request: NextRequest) {
  return await handleRequestProxy(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|serwist|~offline|manifest.webmanifest|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
