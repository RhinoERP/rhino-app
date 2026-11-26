"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const source = process.env.MELI_TEST_DATABASE_ADMIN_URL;
if (!source) {
  throw new Error(
    "Definí MELI_TEST_DATABASE_ADMIN_URL para un servidor de prueba autorizado."
  );
}
const database = `meli_period_test_${crypto.randomBytes(8).toString("hex")}`;
const url = new URL(source);
url.pathname = `/${database}`;
const options = { connectionTimeoutMillis: 10_000 };
const migrationDir = path.resolve(__dirname, "..", "migrations");
const root = path.resolve(__dirname, "..", "..", "..");
const lineBreak = /\r?\n/;
const migrations = [
  "001_create_schema.sql",
  "002_initial_tables.sql",
  "006_add_usd_to_journal.sql",
  "024_meli_payment_reversal_foundation.sql",
  "025_meli_journal_foundation.sql",
  "026_meli_journal_recovery_foundation.sql",
  "027_meli_reversal_recovery_foundation.sql",
  "028_meli_posting_period_foundation.sql",
  "029_meli_period_audit_foundation.sql",
  "030_meli_reversal_source_verification.sql",
];

async function setupFixture(setup) {
  for (const file of migrations) {
    await setup.query(fs.readFileSync(path.join(migrationDir, file), "utf8"));
  }
  for (const file of [
    "meli-posting-period-foundation.sql",
    "meli-period-audit-foundation.sql",
    "meli-reversal-source-verification.sql",
  ]) {
    try {
      await setup.query(fs.readFileSync(path.join(__dirname, file), "utf8"));
    } catch (error) {
      throw new Error(`Falló ${file}: ${error.message}`, { cause: error });
    }
  }
}

function expandSql(file) {
  return fs
    .readFileSync(file, "utf8")
    .split(lineBreak)
    .map((line) => {
      if (line.startsWith("\\set ")) {
        return "";
      }
      if (line.startsWith("\\ir ")) {
        return expandSql(
          path.resolve(path.dirname(file), line.slice(4).trim())
        );
      }
      return line;
    })
    .join("\n");
}

async function exerciseSaleCapacity(setup, first, second) {
  await setup.query(
    expandSql(
      path.join(
        root,
        "supabase",
        "tests",
        "mercadolibre-sale-accounting-reservations.sql"
      )
    )
  );
  await setup.query(`
    INSERT INTO public.mercadolibre_fiscal_accounting_dispatches VALUES (md5('invoice')::uuid, 'PUBLISHED');
    UPDATE public.mercadolibre_payments SET amount = 61 WHERE id = md5('payment')::uuid;
  `);
  const note =
    "INSERT INTO public.mercadolibre_fiscal_accounting_dispatches VALUES (md5('note')::uuid, 'UNCERTAIN')";
  const payment =
    "INSERT INTO public.mercadolibre_accounting_payment_dispatches VALUES (md5('payment-prep')::uuid, 'net', 'UNCERTAIN')";
  await assertCapacityRace(first, second, note, payment);
  await setup.query(
    "DELETE FROM public.mercadolibre_fiscal_accounting_dispatches WHERE preparation_id = md5('note')::uuid"
  );
  await assertCapacityRace(first, second, payment, note);
}

async function assertCapacityRace(first, second, winner, loser) {
  await first.query("BEGIN");
  await first.query(winner);
  await second.query("BEGIN");
  const pending = second.query(loser).then(
    () => ({ success: true, message: "" }),
    (error) => ({ success: false, message: error.message })
  );
  const probe = await Promise.race([
    pending.then(() => "finished"),
    new Promise((resolve) => setTimeout(() => resolve("blocked"), 350)),
  ]);
  if (probe !== "blocked") {
    throw new Error("La reserva competidora no esperó el bloqueo de la venta.");
  }
  await first.query("COMMIT");
  const result = await pending;
  if (result.success || !result.message.includes("exceden")) {
    throw new Error("La reserva competidora no rechazó el exceso.");
  }
  await second.query("ROLLBACK");
}

async function exerciseReversalSource(setup, reader, writer) {
  await setup.query(`
    INSERT INTO accounting.chart_of_accounts
      (id, org_id, codigo, nombre, tipo, naturaleza, moneda)
    VALUES (md5('debit')::uuid, md5('org')::uuid, '1', 'Debit', 'ACTIVO', 'DEUDORA', 'AMBAS'),
      (md5('credit')::uuid, md5('org')::uuid, '2', 'Credit', 'ACTIVO', 'DEUDORA', 'AMBAS');
    INSERT INTO accounting.meli_posting_periods (org_id, period_start, status, changed_by)
      VALUES (md5('org')::uuid, '2026-07-01', 'OPEN', md5('actor')::uuid);
    SELECT accounting.create_meli_journal_entry(
      md5('org')::uuid, 'payment', md5('payment')::uuid, 'net',
      md5('journal')::uuid, '2026-07-01', 'Cobro', md5('actor')::uuid, 'ARS', 1,
      jsonb_build_array(
        jsonb_build_object('accountId', md5('debit')::uuid, 'side', 'DEBE', 'originalAmount', '1', 'pesosAmount', '1'),
        jsonb_build_object('accountId', md5('credit')::uuid, 'side', 'HABER', 'originalAmount', '1', 'pesosAmount', '1')));
  `);
  const original = await setup.query(
    "SELECT journal_entry_id, payload FROM accounting.meli_journal_requests WHERE request_key=md5('journal')::uuid"
  );
  const entryId = original.rows[0].journal_entry_id;
  const payload = JSON.stringify(original.rows[0].payload);
  const inspect =
    "SELECT * FROM accounting.verify_meli_payment_reversal_source(md5('org')::uuid, $1, md5('journal')::uuid, $2::jsonb, md5('reverse')::uuid, '2026-07-02', 'Reversión', md5('actor')::uuid)";
  await reader.query("BEGIN");
  await reader.query(inspect, [entryId, payload]);
  await writer.query("BEGIN");
  const pending = writer.query(
    "SELECT accounting.reverse_verified_meli_payment(md5('org')::uuid, $1, md5('journal')::uuid, $2::jsonb, md5('reverse')::uuid, '2026-07-02', 'Reversión', md5('actor')::uuid) AS id",
    [entryId, payload]
  );
  const probe = await Promise.race([
    pending.then(() => "finished"),
    new Promise((resolve) => setTimeout(() => resolve("blocked"), 350)),
  ]);
  if (probe !== "blocked") {
    throw new Error("La reversión no esperó la verificación del original.");
  }
  await reader.query("COMMIT");
  const reversed = await pending;
  await writer.query("COMMIT");
  const verified = await setup.query(inspect, [entryId, payload]);
  if (verified.rows[0].reversal_entry_id !== reversed.rows[0].id) {
    throw new Error("No se verificó la reversión después de la concurrencia.");
  }
  await reader.query("BEGIN");
  await reader.query(inspect, [entryId, payload]);
  await writer.query("BEGIN");
  const update = writer.query(
    "UPDATE accounting.journal_entry_lines SET monto_origen = 2 WHERE journal_entry_id = $1 AND cuenta_id = md5('debit')::uuid",
    [entryId]
  );
  const updateProbe = await Promise.race([
    update.then(() => "finished"),
    new Promise((resolve) => setTimeout(() => resolve("blocked"), 350)),
  ]);
  if (updateProbe !== "blocked") {
    throw new Error("La modificación de líneas no esperó la verificación.");
  }
  await reader.query("COMMIT");
  await update;
  await writer.query("ROLLBACK");
  await setup.query(`
    SELECT accounting.create_meli_journal_entry(
      md5('org')::uuid, 'payment', md5('other-payment')::uuid, 'net',
      md5('other-journal')::uuid, '2026-07-01', 'Cobro', md5('actor')::uuid, 'ARS', 1,
      jsonb_build_array(
        jsonb_build_object('accountId', md5('debit')::uuid, 'side', 'DEBE', 'originalAmount', '1', 'pesosAmount', '1'),
        jsonb_build_object('accountId', md5('credit')::uuid, 'side', 'HABER', 'originalAmount', '1', 'pesosAmount', '1')));
  `);
  const secondOriginal = await setup.query(
    "SELECT journal_entry_id, payload FROM accounting.meli_journal_requests WHERE request_key=md5('other-journal')::uuid"
  );
  const secondArgs = [
    secondOriginal.rows[0].journal_entry_id,
    JSON.stringify(secondOriginal.rows[0].payload),
  ];
  const reverse =
    "SELECT accounting.reverse_verified_meli_payment(md5('org')::uuid, $1, md5('other-journal')::uuid, $2::jsonb, md5('other-reverse')::uuid, '2026-07-02', 'Reversión', md5('actor')::uuid) AS id";
  await reader.query("BEGIN");
  const firstReverse = await reader.query(reverse, secondArgs);
  await writer.query("BEGIN");
  const secondReverse = writer.query(reverse, secondArgs);
  const retryProbe = await Promise.race([
    secondReverse.then(() => "finished"),
    new Promise((resolve) => setTimeout(() => resolve("blocked"), 350)),
  ]);
  if (retryProbe !== "blocked") {
    throw new Error("El reintento de reversión no esperó el primer envío.");
  }
  await reader.query("COMMIT");
  const retried = await secondReverse;
  await writer.query("COMMIT");
  if (firstReverse.rows[0].id !== retried.rows[0].id) {
    throw new Error("El reintento concurrente produjo otra reversión.");
  }
}

async function exercise(setup, posting, closing) {
  await setupFixture(setup);
  await setup.query(
    "SELECT * FROM accounting.change_meli_posting_period(md5('org')::uuid, '2026-04-01', 'UNCONFIGURED', 'OPEN', md5('actor')::uuid, 'Apertura prueba', md5('open')::uuid)"
  );
  await posting.query("BEGIN");
  await posting.query(
    "INSERT INTO accounting.journal_entries (org_id, tipo_evento, fecha, idempotency_key) VALUES (md5('org')::uuid, 'MELI_FACTURA', '2026-04-10', 'period-concurrency')"
  );
  await closing.query("BEGIN");
  const pending = closing.query(
    "SELECT * FROM accounting.change_meli_posting_period(md5('org')::uuid, '2026-04-01', 'OPEN', 'CLOSED', md5('actor')::uuid, 'Cierre prueba', md5('close')::uuid)"
  );
  const probe = await Promise.race([
    pending.then(() => "finished"),
    new Promise((resolve) => setTimeout(() => resolve("blocked"), 350)),
  ]);
  if (probe !== "blocked") {
    throw new Error("El cierre no esperó el asiento en curso.");
  }
  await posting.query("COMMIT");
  await pending;
  await closing.query("COMMIT");
  let rejected = false;
  try {
    await setup.query(
      "INSERT INTO accounting.journal_entries (org_id, tipo_evento, fecha, idempotency_key) VALUES (md5('org')::uuid, 'MELI_FACTURA', '2026-04-10', 'after-close')"
    );
  } catch (error) {
    if (!error.message.includes("período contable Meli")) {
      throw error;
    }
    rejected = true;
  }
  if (!rejected) {
    throw new Error("Se aceptó un asiento después del cierre.");
  }
  await setup.query(
    "SELECT * FROM accounting.change_meli_posting_period(md5('org')::uuid, '2026-05-01', 'UNCONFIGURED', 'OPEN', md5('actor')::uuid, 'Apertura prueba', md5('open2')::uuid)"
  );
  await closing.query("BEGIN");
  await closing.query(
    "SELECT * FROM accounting.change_meli_posting_period(md5('org')::uuid, '2026-05-01', 'OPEN', 'CLOSED', md5('actor')::uuid, 'Cierre prueba', md5('close2')::uuid)"
  );
  await posting.query("BEGIN");
  const postingPending = posting
    .query(
      "INSERT INTO accounting.journal_entries (org_id, tipo_evento, fecha, idempotency_key) VALUES (md5('org')::uuid, 'MELI_FACTURA', '2026-05-10', 'closing-first')"
    )
    .then(
      () => ({ success: true, message: "" }),
      (error) => ({ success: false, message: error.message })
    );
  const postingProbe = await Promise.race([
    postingPending.then(() => "finished"),
    new Promise((resolve) => setTimeout(() => resolve("blocked"), 350)),
  ]);
  if (postingProbe !== "blocked") {
    throw new Error("El asiento no esperó el cierre en curso.");
  }
  await closing.query("COMMIT");
  const postingResult = await postingPending;
  if (
    postingResult.success ||
    !postingResult.message.includes("período contable Meli")
  ) {
    throw new Error("El asiento no rechazó el cierre confirmado.");
  }
  await posting.query("ROLLBACK");
  await posting.query("BEGIN");
  await posting.query(
    "SELECT * FROM accounting.change_meli_posting_period(md5('org')::uuid, '2026-06-01', 'UNCONFIGURED', 'OPEN', md5('actor')::uuid, 'Apertura prueba', md5('open3')::uuid)"
  );
  await closing.query("BEGIN");
  const changePending = closing
    .query(
      "SELECT * FROM accounting.change_meli_posting_period(md5('org')::uuid, '2026-06-01', 'UNCONFIGURED', 'CLOSED', md5('actor')::uuid, 'Cierre prueba', md5('close3')::uuid)"
    )
    .then(
      () => ({ success: true, code: "" }),
      (error) => ({ success: false, code: error.code })
    );
  const changeProbe = await Promise.race([
    changePending.then(() => "finished"),
    new Promise((resolve) => setTimeout(() => resolve("blocked"), 350)),
  ]);
  if (changeProbe !== "blocked") {
    throw new Error("El segundo cambio no esperó la apertura inicial.");
  }
  await posting.query("COMMIT");
  const changeResult = await changePending;
  if (changeResult.success || changeResult.code !== "40001") {
    throw new Error("El cambio concurrente no rechazó el estado obsoleto.");
  }
  await closing.query("ROLLBACK");
  const privilege = await setup.query(
    "SELECT has_function_privilege('authenticated', 'accounting.change_meli_posting_period(uuid,date,text,text,uuid,text,uuid)', 'EXECUTE') AS allowed"
  );
  if (privilege.rows[0].allowed) {
    throw new Error("La función es ejecutable por authenticated.");
  }
}

async function exerciseJournalIntegrity(setup, creator, writer) {
  await setup.query(
    fs.readFileSync(
      path.join(migrationDir, "031_meli_journal_integrity.sql"),
      "utf8"
    )
  );
  const create = `
    SELECT accounting.create_meli_journal_entry(
      md5('org')::uuid, $1, md5($2)::uuid, 'fiscal', md5($3)::uuid,
      '2026-07-01', 'Fiscal', md5('actor')::uuid, 'ARS', 1,
      jsonb_build_array(
        jsonb_build_object('accountId', md5('debit')::uuid, 'side', 'DEBE', 'originalAmount', '1', 'pesosAmount', '1'),
        jsonb_build_object('accountId', md5('credit')::uuid, 'side', 'HABER', 'originalAmount', '1', 'pesosAmount', '1'))
    ) AS id
  `;
  const attacks = [
    {
      kind: "invoice",
      origin: "integrity-invoice",
      request: "integrity-invoice-request",
      sql: "INSERT INTO accounting.journal_entry_lines (journal_entry_id, cuenta_id, debe) VALUES ($1, md5('debit')::uuid, 1)",
      expected: "son inmutables",
    },
    {
      kind: "creditNote",
      origin: "integrity-note",
      request: "integrity-note-request",
      sql: "INSERT INTO accounting.journal_entries (org_id, tipo_evento, referencia_tabla, referencia_id, fecha, idempotency_key) VALUES (md5('org')::uuid, 'CONTRA_ASIENTO', 'accounting.journal_entries', $1, '2026-07-01', 'integrity:unexpected-contra')",
      expected: "no admite reversión genérica",
    },
    {
      kind: "invoice",
      origin: "integrity-invoice-repeatable",
      request: "integrity-invoice-repeatable-request",
      sql: "INSERT INTO accounting.journal_entry_lines (journal_entry_id, cuenta_id, debe) VALUES ($1, md5('debit')::uuid, 1)",
      expected: "son inmutables",
      isolation: "REPEATABLE READ",
      allowedCode: "23503",
    },
    {
      kind: "creditNote",
      origin: "integrity-note-repeatable",
      request: "integrity-note-repeatable-request",
      sql: "INSERT INTO accounting.journal_entries (org_id, tipo_evento, referencia_tabla, referencia_id, fecha, idempotency_key) VALUES (md5('org')::uuid, 'CONTRA_ASIENTO', 'accounting.journal_entries', $1, '2026-07-01', 'integrity:repeatable-contra')",
      expected: "no existe o no es visible",
      isolation: "REPEATABLE READ",
    },
    {
      kind: "creditNote",
      origin: "integrity-note-serializable",
      request: "integrity-note-serializable-request",
      sql: "INSERT INTO accounting.journal_entries (org_id, tipo_evento, referencia_tabla, referencia_id, fecha, idempotency_key) VALUES (md5('org')::uuid, 'CONTRA_ASIENTO', 'accounting.journal_entries', $1, '2026-07-01', 'integrity:serializable-contra')",
      expected: "no existe o no es visible",
      isolation: "SERIALIZABLE",
      allowedCode: "40001",
    },
  ];
  for (const attack of attacks) {
    await creator.query("BEGIN");
    const result = await creator.query(create, [
      attack.kind,
      attack.origin,
      attack.request,
    ]);
    await writer.query("BEGIN");
    if (attack.isolation) {
      await writer.query(`SET TRANSACTION ISOLATION LEVEL ${attack.isolation}`);
      await writer.query("SELECT 1");
    }
    await writer.query("SET LOCAL lock_timeout = '10s'");
    const pending = writer.query(attack.sql, [result.rows[0].id]).then(
      () => ({ success: true, message: "", code: "" }),
      (error) => ({ success: false, message: error.message, code: error.code })
    );
    const probe = await Promise.race([
      pending.then(() => "finished"),
      new Promise((resolve) => setTimeout(() => resolve("blocked"), 350)),
    ]);
    if (probe !== "blocked") {
      throw new Error("La modificación no esperó el asiento en curso.");
    }
    await creator.query("COMMIT");
    const outcome = await pending;
    if (
      outcome.success ||
      (!outcome.message.includes(attack.expected) &&
        outcome.code !== attack.allowedCode)
    ) {
      throw new Error(
        `La modificación concurrente no fue rechazada: ${outcome.message}`
      );
    }
    await writer.query("ROLLBACK");
  }
  await setup.query(`
    SELECT accounting.create_meli_journal_entry(
      md5('org')::uuid, 'payment', md5('integrity-payment')::uuid, 'net',
      md5('integrity-payment-request')::uuid, '2026-07-01',
      'Cobro', md5('actor')::uuid, 'ARS', 1,
      jsonb_build_array(
        jsonb_build_object('accountId', md5('debit')::uuid, 'side', 'DEBE', 'originalAmount', '1', 'pesosAmount', '1'),
        jsonb_build_object('accountId', md5('credit')::uuid, 'side', 'HABER', 'originalAmount', '1', 'pesosAmount', '1'))
    )
  `);
  const original = await setup.query(
    "SELECT journal_entry_id, payload FROM accounting.meli_journal_requests WHERE request_key=md5('integrity-payment-request')::uuid"
  );
  const args = [
    original.rows[0].journal_entry_id,
    JSON.stringify(original.rows[0].payload),
  ];
  const reverse = `
    SELECT accounting.reverse_verified_meli_payment(
      md5('org')::uuid, $1, md5('integrity-payment-request')::uuid, $2::jsonb,
      md5('integrity-payment-reverse')::uuid, '2026-07-02', 'Reversión',
      md5('actor')::uuid
    ) AS id
  `;
  await creator.query("BEGIN");
  const created = await creator.query(reverse, args);
  await writer.query("BEGIN");
  await writer.query("SET LOCAL lock_timeout = '10s'");
  const pending = writer
    .query(
      "UPDATE accounting.journal_entry_lines SET monto_origen = 2 WHERE journal_entry_id = $1",
      [args[0]]
    )
    .then(
      () => ({ success: true, message: "" }),
      (error) => ({ success: false, message: error.message })
    );
  const probe = await Promise.race([
    pending.then(() => "finished"),
    new Promise((resolve) => setTimeout(() => resolve("blocked"), 350)),
  ]);
  if (probe !== "blocked") {
    throw new Error("La modificación no esperó la reversión en curso.");
  }
  await creator.query("COMMIT");
  const outcome = await pending;
  if (outcome.success || !outcome.message.includes("son inmutables")) {
    throw new Error("Se aceptó una modificación del original Meli.");
  }
  await writer.query("ROLLBACK");
  const replay = await setup.query(reverse, args);
  if (replay.rows[0].id !== created.rows[0].id) {
    throw new Error("El reintento de reversión no devolvió el mismo recibo.");
  }
}

async function main() {
  const admin = new Client({ ...options, connectionString: source });
  const clients = [];
  let created = false;
  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    for (let index = 0; index < 3; index++) {
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
    }
    await exercise(...clients);
    await exerciseReversalSource(...clients);
    await exerciseSaleCapacity(...clients);
    await exerciseJournalIntegrity(...clients);
    console.log(
      "Períodos, reversión, capacidad e integridad: pruebas SQL y de concurrencia aprobadas."
    );
  } finally {
    for (const client of clients) {
      await client.end().catch((error) => {
        console.error("Error cerrando conexión de prueba:", error.message);
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
      console.error("Error cerrando conexión administrativa:", error.message);
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
  console.error(`Prueba de períodos: ${error.message}`);
  process.exitCode = 1;
});
