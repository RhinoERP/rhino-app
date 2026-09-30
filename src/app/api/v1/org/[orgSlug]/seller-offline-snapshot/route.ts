import { type NextRequest, NextResponse } from "next/server";
import {
  etagMatches,
  getSellerOfflineSnapshotEtag,
} from "@/modules/offline/server/seller-offline-snapshot-version";
import {
  createSellerOfflineSnapshot,
  SellerOfflineSnapshotError,
} from "@/modules/offline/service/seller-offline-snapshot.service";

type RouteContext = {
  params: Promise<{ orgSlug: string }>;
};

const PRIVATE_NO_STORE = "private, no-store, max-age=0";

export async function GET(request: NextRequest, context: RouteContext) {
  const startedAt = performance.now();

  try {
    const { orgSlug } = await context.params;
    const snapshot = await createSellerOfflineSnapshot(orgSlug);
    const durationMs = Math.round(performance.now() - startedAt);
    const etag = getSellerOfflineSnapshotEtag(snapshot);
    const commonHeaders = {
      "Cache-Control": PRIVATE_NO_STORE,
      ETag: etag,
      "Server-Timing": `snapshot;dur=${durationMs}`,
      "X-Snapshot-Expires-At": snapshot.expiresAt,
      "X-Snapshot-Generated-At": snapshot.generatedAt,
      "X-Snapshot-Schema-Version": String(snapshot.schemaVersion),
    };

    if (etagMatches(request.headers.get("if-none-match"), etag)) {
      return new NextResponse(null, {
        status: 304,
        headers: commonHeaders,
      });
    }

    const body = JSON.stringify(snapshot);

    return new NextResponse(body, {
      headers: {
        ...commonHeaders,
        "Content-Type": "application/json; charset=utf-8",
        "X-Snapshot-Bytes": String(Buffer.byteLength(body, "utf8")),
        "X-Snapshot-Customers": String(snapshot.customers.length),
        "X-Snapshot-Products": String(snapshot.products.length),
      },
    });
  } catch (error) {
    if (error instanceof SellerOfflineSnapshotError) {
      return NextResponse.json(
        { code: error.code, error: error.message },
        {
          status: error.status,
          headers: { "Cache-Control": PRIVATE_NO_STORE },
        }
      );
    }

    console.error("Error generando snapshot offline", { error });
    return NextResponse.json(
      { code: "INTERNAL_ERROR", error: "No se pudo generar el snapshot" },
      {
        status: 500,
        headers: { "Cache-Control": PRIVATE_NO_STORE },
      }
    );
  }
}
