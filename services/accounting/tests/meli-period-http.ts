import { strict as assert } from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { test } from "node:test";
import { Client } from "pg";

async function dropDatabase(admin: Client, name: string) {
  await admin.query(`ALTER DATABASE "${name}" WITH ALLOW_CONNECTIONS false`);
  await admin.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND backend_type='client backend' AND usename=current_user AND pid <> pg_backend_pid()",
    [name]
  );
  for (let attempt = 0; ; attempt++) {
    try {
      await admin.query(`DROP DATABASE "${name}"`);
      return;
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          "code" in error &&
          error.code === "55006"
        ) ||
        attempt === 19
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

test("HTTP interno y auditoría de períodos en base descartable", async () => {
  const source = process.env.MELI_TEST_DATABASE_ADMIN_URL;
  if (!source) {
    throw new Error(
      "Definí MELI_TEST_DATABASE_ADMIN_URL para un servidor de prueba autorizado."
    );
  }
  const name = `meli_period_http_${randomBytes(8).toString("hex")}`;
  const testUrl = new URL(source);
  testUrl.pathname = `/${name}`;
  const admin = new Client({ connectionString: source });
  let created = false;
  let server:
    | ReturnType<ReturnType<typeof import("../src/index").createApp>["listen"]>
    | undefined;
  let database: typeof import("../src/db/client") | undefined;
  const setup = new Client({ connectionString: testUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    await setup.connect();
    const identity = await setup.query("SELECT current_database() AS name");
    assert.equal(identity.rows[0].name, name);
    for (const migration of [
      "001_create_schema.sql",
      "002_initial_tables.sql",
      "006_add_usd_to_journal.sql",
      "028_meli_posting_period_foundation.sql",
      "029_meli_period_audit_foundation.sql",
    ]) {
      await setup.query(
        await readFile(path.resolve("migrations", migration), "utf8")
      );
    }
    process.env.DATABASE_URL = testUrl.toString();
    Object.assign(process.env, { NODE_ENV: "test" });
    process.env.SERVICE_TOKEN = randomUUID();
    const { createApp } = await import("../src/index.js");
    database = await import("../src/db/client.js");
    const app = createApp();
    const listener = await new Promise<ReturnType<typeof app.listen>>(
      (resolve) => {
        const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
      }
    );
    server = listener;
    const base = `http://127.0.0.1:${(listener.address() as AddressInfo).port}/internal/meli/journal/period`;
    const post = (route: string, body: unknown, authenticated = true) =>
      fetch(`${base}/${route}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(authenticated
            ? { "x-service-token": process.env.SERVICE_TOKEN as string }
            : {}),
        },
        body: JSON.stringify(body),
      });
    const orgId = randomUUID();
    const actorId = randomUUID();
    const request = {
      orgId,
      actorId,
      periodStart: "2026-11-01",
      expectedStatus: "UNCONFIGURED",
      newStatus: "OPEN",
      reason: "Apertura de prueba",
      requestKey: randomUUID(),
    };
    assert.equal((await post("change", request, false)).status, 401);
    assert.equal(
      (await post("change", { ...request, actorId: "invalid" })).status,
      400
    );
    const opened = await post("change", request);
    assert.equal(opened.status, 200);
    assert.deepEqual((await opened.json()).data, {
      status: "OPEN",
      idempotent: false,
    });
    const retry = await post("change", request);
    assert.deepEqual((await retry.json()).data, {
      status: "OPEN",
      idempotent: true,
    });
    const status = await post("inspect", { orgId, date: "2026-11-23" });
    assert.deepEqual((await status.json()).data, { status: "OPEN" });
    assert.equal(
      (await post("change", { ...request, reason: "Otro motivo" })).status,
      409
    );
    assert.equal(
      (await post("change", { ...request, requestKey: randomUUID() })).status,
      409
    );
    const closed = await post("change", {
      ...request,
      expectedStatus: "OPEN",
      newStatus: "CLOSED",
      reason: "Cierre de prueba",
      requestKey: randomUUID(),
    });
    assert.equal(closed.status, 200);
    const audit = await setup.query(
      "SELECT previous_status, new_status, actor_id, reason FROM accounting.meli_posting_period_changes WHERE org_id = $1 ORDER BY changed_at",
      [orgId]
    );
    assert.deepEqual(
      audit.rows.map((row) => [
        row.previous_status,
        row.new_status,
        row.actor_id,
        row.reason,
      ]),
      [
        ["UNCONFIGURED", "OPEN", actorId, "Apertura de prueba"],
        ["OPEN", "CLOSED", actorId, "Cierre de prueba"],
      ]
    );
    const concurrentOrg = randomUUID();
    const concurrentRequests = [
      { ...request, orgId: concurrentOrg, requestKey: randomUUID() },
      {
        ...request,
        orgId: concurrentOrg,
        requestKey: randomUUID(),
        newStatus: "CLOSED",
        reason: "Cierre concurrente",
      },
    ];
    const concurrentResponses = await Promise.all(
      concurrentRequests.map((payload) => post("change", payload))
    );
    assert.deepEqual(
      concurrentResponses.map((response) => response.status).sort(),
      [200, 409]
    );
    const concurrentAudit = await setup.query(
      "SELECT count(*)::int AS count FROM accounting.meli_posting_period_changes WHERE org_id = $1",
      [concurrentOrg]
    );
    assert.equal(concurrentAudit.rows[0].count, 1);
  } finally {
    try {
      if (server) {
        await new Promise<void>((resolve, reject) =>
          server?.close((error) => (error ? reject(error) : resolve()))
        );
      }
      if (database) {
        await database.db.destroy();
      }
      await setup.end();
      if (created) {
        await dropDatabase(admin, name);
      }
    } finally {
      await admin.end();
    }
  }
});
