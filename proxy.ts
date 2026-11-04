import type { NextRequest } from "next/server";
import { handleRequestProxy } from "@/lib/request-proxy";

export async function proxy(request: NextRequest) {
  return await handleRequestProxy(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - serwist (service worker route)
     * - favicon.ico and public images
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|serwist|~offline|manifest.webmanifest|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
