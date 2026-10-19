import type {
  PrecacheEntry,
  RuntimeCaching,
  SerwistGlobalConfig,
} from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope;

const isProtectedRequest = ({
  request,
  url,
}: {
  request: Request;
  url: URL;
}) => {
  const isRscRequest =
    request.headers.get("RSC") === "1" ||
    request.headers.has("Next-Router-Prefetch") ||
    request.headers.has("Next-Router-State-Tree") ||
    url.searchParams.has("_rsc");

  return (
    isRscRequest ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/org/") ||
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/auth/")
  );
};

const runtimeCaching: RuntimeCaching[] = [
  {
    matcher: isProtectedRequest,
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ request, url }) =>
      url.origin === globalThis.location.origin &&
      (url.pathname.startsWith("/_next/static/") ||
        url.pathname.startsWith("/images/") ||
        url.pathname.startsWith("/icons/")) &&
      ["font", "image", "script", "style"].includes(request.destination),
    handler: new CacheFirst({
      cacheName: "rhinos-public-assets-v1",
      plugins: [
        new ExpirationPlugin({
          maxAgeSeconds: 30 * 24 * 60 * 60,
          maxEntries: 128,
        }),
      ],
    }),
  },
  {
    matcher: ({ request, url }) =>
      url.origin === globalThis.location.origin && request.mode === "navigate",
    handler: new NetworkOnly(),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
