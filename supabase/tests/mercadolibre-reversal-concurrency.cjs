"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..", "..");
const service = path.join(root, "services", "accounting");
const { Client } = require(require.resolve("pg", { paths: [service] }));
const database = `meli_test_${crypto.randomBytes(8).toString("hex")}`;
const sourceUrl = process.env.MELI_TEST_DATABASE_ADMIN_URL;
if (!sourceUrl) {
  throw new Error(
    "Definí MELI_TEST_DATABASE_ADMIN_URL para un servidor PostgreSQL de prueba autorizado."
  );
}
const url = new URL(sourceUrl);
url.pathname = `/${database}`;
const options = { connectionTimeoutMillis: 10_000 };
const lineBreak = /\r?\n/;
const fixtureRole = /^CREATE ROLE (anon|authenticated|service_role);$/;
function expand(file) {
  return fs
    .readFileSync(file, "utf8")
    .split(lineBreak)
    .map((line) => {
      if (line.startsWith("\\set ") || fixtureRole.test(line)) {
        return "";
      }
      if (line.startsWith("\\ir ")) {
        return expand(path.resolve(path.dirname(file), line.slice(4).trim()));
      }
      return line;
    })
    .join("\n");
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep concurrent transactions and cleanup in one scope.
async function main() {
  const admin = new Client({ ...options, connectionString: sourceUrl });
  let created = false;
  const clients = [];
  try {
    await admin.connect();
    const roles = await admin.query(
      "SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])",
      [["anon", "authenticated", "service_role"]]
    );
    if (roles.rows.length !== 3) {
      throw new Error(
        "Faltan roles del fixture; se omite la prueba para no crearlos globalmente."
      );
    }
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    for (let i = 0; i < 3; i++) {
      const client = new Client({
        ...options,
        connectionString: url.toString(),
      });
      clients.push(client);
      await client.connect();
      const current = await client.query("SELECT current_database() AS name");
      if (current.rows[0].name !== database) {
        throw new Error("La conexión no corresponde a la base descartable.");
      }
      await client.query(
        "SELECT set_config('request.jwt.claim.role', 'service_role', false)"
      );
    }
    const [setup, first, second] = clients;
    await setup.query(
      expand(
        path.join(__dirname, "mercadolibre-payment-reversal-reservations.sql")
      )
    );
    await setup.query(`
      INSERT INTO public.mercadolibre_payments
        (id, organization_id, sales_order_id, warehouse_id, amount, currency, payment_date, status)
      VALUES (md5('concurrent-payment')::uuid, md5('org')::uuid, md5('sale')::uuid, md5('warehouse')::uuid, 100, 'ARS', '2026-11-21', 'RECORDED');
      SELECT * FROM public.save_meli_accounting_breakdown_draft(md5('org')::uuid, md5('owner')::uuid,
        md5('concurrent-payment')::uuid, md5('concurrent-draft')::uuid, 0,
        '{"net":"80","discount":"5","commission":"10","shipping":"5"}'::jsonb, '');
    `);
    const draft = await setup.query(
      "SELECT id FROM public.mercadolibre_accounting_breakdown_drafts WHERE payment_id=md5('concurrent-payment')::uuid AND active"
    );
    const prepared = await setup.query(
      "SELECT * FROM public.prepare_meli_accounting_payment(md5('org')::uuid, md5('owner')::uuid, md5('concurrent-payment')::uuid, $1, md5('concurrent-prep')::uuid)",
      [draft.rows[0].id]
    );
    const id = prepared.rows[0].preparation_id;
    const begin =
      "SELECT * FROM public.begin_meli_payment_dispatch(md5('org')::uuid, md5('owner')::uuid, $1, $2, $3::uuid, '{}'::jsonb)";
    await setup.query(begin, [
      id,
      "net",
      "00000000-0000-4000-8000-000000000101",
    ]);
    await setup.query(
      "SELECT * FROM public.confirm_meli_payment_dispatch(md5('org')::uuid, md5('owner')::uuid, $1, 'net', '00000000-0000-4000-8000-000000000101', '{}'::jsonb, '00000000-0000-4000-8000-000000000102')",
      [id]
    );
    await first.query("BEGIN");
    await first.query(
      "SELECT * FROM public.reserve_meli_payment_reversal(md5('org')::uuid, md5('owner')::uuid, md5('concurrent-payment')::uuid, $1, '00000000-0000-4000-8000-000000000103', '2026-11-23', 'Carga errónea')",
      [id]
    );
    await second.query("BEGIN");
    const pending = second
      .query(begin, [id, "discount", "00000000-0000-4000-8000-000000000104"])
      .then(
        () => ({ success: true }),
        (error) => ({ success: false, message: error.message })
      );
    const probe = await Promise.race([
      pending.then(() => "finished"),
      new Promise((resolve) => setTimeout(() => resolve("blocked"), 350)),
    ]);
    if (probe !== "blocked") {
      throw new Error("El despacho no esperó el bloqueo de la reserva.");
    }
    await first.query("COMMIT");
    const result = await pending;
    if (result.success || !result.message.includes("reversión en curso")) {
      throw new Error(
        `El despacho no fue rechazado tras la reserva: ${result.message || "aceptado"}`
      );
    }
    await second.query("ROLLBACK");
    await setup.query(`
      INSERT INTO public.mercadolibre_payments
        (id, organization_id, sales_order_id, warehouse_id, amount, currency, payment_date, status)
      VALUES (md5('dispatch-first')::uuid, md5('org')::uuid, md5('sale')::uuid, md5('warehouse')::uuid, 100, 'ARS', '2026-11-21', 'RECORDED');
      SELECT * FROM public.save_meli_accounting_breakdown_draft(md5('org')::uuid, md5('owner')::uuid,
        md5('dispatch-first')::uuid, md5('draft-first')::uuid, 0,
        '{"net":"80","discount":"5","commission":"10","shipping":"5"}'::jsonb, '');
    `);
    const draft2 = await setup.query(
      "SELECT id FROM public.mercadolibre_accounting_breakdown_drafts WHERE payment_id=md5('dispatch-first')::uuid AND active"
    );
    const prep2 = await setup.query(
      "SELECT * FROM public.prepare_meli_accounting_payment(md5('org')::uuid, md5('owner')::uuid, md5('dispatch-first')::uuid, $1, md5('prep-first')::uuid)",
      [draft2.rows[0].id]
    );
    const id2 = prep2.rows[0].preparation_id;
    await setup.query(begin, [
      id2,
      "net",
      "00000000-0000-4000-8000-000000000105",
    ]);
    await setup.query(
      "SELECT * FROM public.confirm_meli_payment_dispatch(md5('org')::uuid, md5('owner')::uuid, $1, 'net', '00000000-0000-4000-8000-000000000105', '{}'::jsonb, '00000000-0000-4000-8000-000000000106')",
      [id2]
    );
    await first.query("BEGIN");
    await first.query(begin, [
      id2,
      "discount",
      "00000000-0000-4000-8000-000000000107",
    ]);
    await second.query("BEGIN");
    const reservePending = second
      .query(
        "SELECT * FROM public.reserve_meli_payment_reversal(md5('org')::uuid, md5('owner')::uuid, md5('dispatch-first')::uuid, $1, '00000000-0000-4000-8000-000000000108', '2026-11-23', 'Carga errónea')",
        [id2]
      )
      .then(
        () => ({ success: true }),
        (error) => ({ success: false, message: error.message })
      );
    const probe2 = await Promise.race([
      reservePending.then(() => "finished"),
      new Promise((resolve) => setTimeout(() => resolve("blocked"), 350)),
    ]);
    if (probe2 !== "blocked") {
      throw new Error("La reserva no esperó el bloqueo del despacho.");
    }
    await first.query("COMMIT");
    const result2 = await reservePending;
    if (result2.success || !result2.message.includes("envíos inciertos")) {
      throw new Error(
        `La reserva no rechazó el envío incierto: ${result2.message || "aceptada"}`
      );
    }
    await second.query("ROLLBACK");
    await setup.query(`
      ALTER TABLE public.sales_orders ADD COLUMN warehouse_id uuid, ADD COLUMN currency text;
      UPDATE public.sales_orders SET warehouse_id=md5('warehouse')::uuid, currency='ARS';
      ALTER TABLE public.mercadolibre_payments
        ADD COLUMN idempotency_key uuid, ADD COLUMN request_payload jsonb,
        ADD COLUMN fiscal_receiver_snapshot jsonb, ADD COLUMN destination text,
        ADD COLUMN reference_number text, ADD COLUMN notes text,
        ADD COLUMN created_by uuid, ADD COLUMN created_at timestamptz,
        ADD COLUMN voided_at timestamptz;
      INSERT INTO public.mercadolibre_payments
        (id, organization_id, sales_order_id, warehouse_id, amount, currency, payment_date, status)
      VALUES (md5('real-void')::uuid, md5('org')::uuid, md5('sale')::uuid, md5('warehouse')::uuid, 100, 'ARS', '2026-11-21', 'RECORDED');
      SELECT * FROM public.save_meli_accounting_breakdown_draft(md5('org')::uuid, md5('owner')::uuid,
        md5('real-void')::uuid, md5('real-draft')::uuid, 0,
        '{"net":"100","discount":"0","commission":"0","shipping":"0"}'::jsonb, '');
    `);
    const gross = fs.readFileSync(
      path.join(
        root,
        "supabase",
        "migrations",
        "20261116070000_mercadolibre_gross_payments.sql"
      ),
      "utf8"
    );
    const extract = (name) => {
      const start = gross.indexOf(`CREATE FUNCTION public.${name}(`);
      if (start < 0) {
        throw new Error(`No se encontró la función real ${name}`);
      }
      const end = gross.indexOf("\n$$;", start);
      if (end < 0) {
        throw new Error(`No se encontró el final de ${name}`);
      }
      return gross
        .slice(start, end + 4)
        .replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION");
    };
    await setup.query(extract("guard_mercadolibre_payment"));
    await setup.query(extract("void_mercadolibre_payment"));
    await setup.query(
      "CREATE TRIGGER real_payment_guard BEFORE UPDATE ON public.mercadolibre_payments FOR EACH ROW EXECUTE FUNCTION public.guard_mercadolibre_payment()"
    );
    const realDraft = await setup.query(
      "SELECT id FROM public.mercadolibre_accounting_breakdown_drafts WHERE payment_id=md5('real-void')::uuid AND active"
    );
    const realPrep = await setup.query(
      "SELECT * FROM public.prepare_meli_accounting_payment(md5('org')::uuid, md5('owner')::uuid, md5('real-void')::uuid, $1, md5('real-prep')::uuid)",
      [realDraft.rows[0].id]
    );
    const realId = realPrep.rows[0].preparation_id;
    await setup.query(begin, [
      realId,
      "net",
      "00000000-0000-4000-8000-000000000109",
    ]);
    await setup.query(
      "SELECT * FROM public.confirm_meli_payment_dispatch(md5('org')::uuid, md5('owner')::uuid, $1, 'net', '00000000-0000-4000-8000-000000000109', '{}'::jsonb, '00000000-0000-4000-8000-000000000110')",
      [realId]
    );
    const reservation = await setup.query(
      "SELECT * FROM public.reserve_meli_payment_reversal(md5('org')::uuid, md5('owner')::uuid, md5('real-void')::uuid, $1, '00000000-0000-4000-8000-000000000111', '2026-11-23', 'Carga errónea')",
      [realId]
    );
    const reservationId = reservation.rows[0].reservation_id;
    const key = await setup.query(
      "SELECT request_key FROM public.mercadolibre_payment_reversal_components WHERE reservation_id=$1 AND component_key='net'",
      [reservationId]
    );
    await setup.query(
      "SELECT * FROM public.confirm_meli_payment_reversal_component(md5('org')::uuid, md5('owner')::uuid, md5('real-void')::uuid, $1, 'net', $2, '00000000-0000-4000-8000-000000000112')",
      [reservationId, key.rows[0].request_key]
    );
    const finalized = await setup.query(
      "SELECT * FROM public.finalize_meli_payment_reversal(md5('org')::uuid, md5('owner')::uuid, md5('real-void')::uuid, $1)",
      [reservationId]
    );
    const state = await setup.query(
      "SELECT status,void_reason,voided_at FROM public.mercadolibre_payments WHERE id=md5('real-void')::uuid"
    );
    if (
      finalized.rows[0].idempotent ||
      state.rows[0].status !== "VOIDED" ||
      state.rows[0].void_reason !== "Carga errónea" ||
      !state.rows[0].voided_at
    ) {
      throw new Error(
        "La anulación con el guard y RPC reales no fue verificada."
      );
    }
    console.log(
      "PostgreSQL: ambos órdenes reserva/despacho serializan; finalización pasó con el guard y RPC comercial reales en fixture simplificado."
    );
  } finally {
    for (const client of clients) {
      await client.end().catch((error) => {
        console.error("Error cerrando una conexión de prueba:", error.message);
        process.exitCode = 1;
      });
    }
    if (created) {
      try {
        await admin.query(
          `ALTER DATABASE "${database}" WITH ALLOW_CONNECTIONS false`
        );
        await admin.query(
          "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND backend_type='client backend' AND usename=current_user AND pid <> pg_backend_pid()",
          [database]
        );
        await dropTemporaryDatabase(admin);
      } catch (error) {
        console.error(
          `No se pudo eliminar la base temporal ${database}: ${error.message}`
        );
        process.exitCode = 1;
      }
    }
    await admin.end().catch((error) => {
      console.error(
        "Error cerrando la conexión administrativa:",
        error.message
      );
      process.exitCode = 1;
    });
  }
}
async function dropTemporaryDatabase(admin) {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await admin.query(`DROP DATABASE "${database}"`);
      return;
    } catch (error) {
      if (error.code !== "55006" || attempt === 19) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}
main().catch((error) => {
  console.error(`Prueba de concurrencia: ${error.message}`);
  process.exitCode = 1;
});
