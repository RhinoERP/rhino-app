import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeDayResultSchema } from "../contracts";
import { withRouteActorNames } from "./route-actors.service";

const getUserById = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin-client", () => ({
  createAdminClient: () => ({ auth: { admin: { getUserById } } }),
}));

const seller = "11111111-1111-4111-8111-111111111111";
const admin = "22222222-2222-4222-8222-222222222222";
const routeId = "33333333-3333-4333-8333-333333333333";

describe("route event actor names", () => {
  beforeEach(() => {
    getUserById.mockReset();
    getUserById.mockImplementation(async (id: string) => ({
      data: {
        user: {
          user_metadata: {
            full_name: id === seller ? "María Pérez" : "Jorge Admin",
          },
        },
      },
      error: null,
    }));
  });

  it("only resolves distinct actors in the already scoped route and keeps the audit IDs", async () => {
    const data = routeDayResultSchema.parse({
      routes: [
        {
          id: routeId,
          number: 1,
          status: "open",
          closedAt: null,
          visits: [],
          events: ["created", "closed", "reopened"].map((action, index) => ({
            action,
            actorId: index === 2 ? admin : seller,
            createdAt: "2026-11-12T12:00:00Z",
            details: {},
          })),
        },
      ],
      customers: [],
    });
    const enriched = await withRouteActorNames(data);
    expect(getUserById).toHaveBeenCalledTimes(2);
    expect(enriched.routes[0].events.map((event) => event.actorName)).toEqual([
      "María Pérez",
      "María Pérez",
      "Jorge Admin",
    ]);
    expect(enriched.routes[0].events[2].actorId).toBe(admin);
  });

  it("does not query the admin API when no route events exist", async () => {
    const data = routeDayResultSchema.parse({ routes: [], customers: [] });
    expect(await withRouteActorNames(data)).toEqual(data);
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("uses a non-identifying fallback when an actor cannot be found", async () => {
    getUserById.mockResolvedValue({ data: { user: null }, error: null });
    const data = routeDayResultSchema.parse({
      routes: [
        {
          id: routeId,
          number: 1,
          status: "open",
          closedAt: null,
          visits: [],
          events: [
            {
              action: "created",
              actorId: seller,
              createdAt: "2026-11-12T12:00:00Z",
              details: {},
            },
          ],
        },
      ],
      customers: [],
    });
    const enriched = await withRouteActorNames(data);
    expect(enriched.routes[0].events[0].actorName).toBe(
      "Usuario no disponible"
    );
  });
});
