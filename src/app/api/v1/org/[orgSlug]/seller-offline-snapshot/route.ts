import { type NextRequest, NextResponse } from "next/server";
import {
  createSellerOfflineSnapshot,
  SellerOfflineSnapshotError,
} from "@/modules/offline/service/seller-offline-snapshot.service";

type RouteContext = {
  params: Promise<{ orgSlug: string }>;
};

const PRIVATE_NO_STORE = "private, no-store, max-age=0";

export async function GET(_request: NextRequest, context: RouteContext) {
  const startedAt = performance.now();

  try {
    const { orgSlug } = await context.params;
    const snapshot = await createSellerOfflineSnapshot(orgSlug);
    const body = JSON.stringify(snapshot);
    const durationMs = Math.round(performance.now() - startedAt);

    return new NextResponse(body, {
      headers: {
        "Cache-Control": PRIVATE_NO_STORE,
        "Content-Type": "application/json; charset=utf-8",
        "Server-Timing": `snapshot;dur=${durationMs}`,
        "X-Snapshot-Bytes": String(Buffer.byteLength(body, "utf8")),
        "X-Snapshot-Customers": String(snapshot.customers.length),
        "X-Snapshot-Products": String(snapshot.products.length),
        "X-Snapshot-Schema-Version": String(snapshot.schemaVersion),
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
