import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Never load application secrets or accept a remote database URL in this runner.
const packageRoot = process.env.CAI_TEST_POSTGRES_PACKAGE_ROOT;
if (!packageRoot) {
  throw new Error(
    "Set CAI_TEST_POSTGRES_PACKAGE_ROOT to a temporary directory containing embedded-postgres (see README-CAI.md)."
  );
}
const require = createRequire(join(resolve(packageRoot), "package.json"));
const { default: EmbeddedPostgres } = await import(
  require.resolve("embedded-postgres")
);
const listener = createServer();
await new Promise((done, reject) => {
  listener.once("error", reject);
  listener.listen(0, "127.0.0.1", done);
});
const port = listener.address().port;
await new Promise((done) => listener.close(done));
const databaseDir = await mkdtemp(join(tmpdir(), "rhino-cai-postgres-"));
const postgres = new EmbeddedPostgres({
  databaseDir,
  port,
  user: "postgres",
  password: randomBytes(24).toString("hex"),
  persistent: false,
  autoRehydrateSymlinks: true,
  createPostgresUser: false,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {
    // Omit routine engine startup messages from the test output.
  },
  onError: () => {
    // PostgreSQL also sends routine startup logs to stderr; queries throw below.
  },
});
const clients = [];
async function client() {
  const connection = postgres.getPgClient("postgres", "127.0.0.1");
  clients.push(connection);
  await connection.connect();
  await connection.query("SET request.jwt.claim.role='service_role'");
  return connection;
}
function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}
function section(sql, from, until) {
  const start = sql.indexOf(from);
  const end = sql.indexOf(until, start);
  if (start < 0 || end < 0) {
    throw new Error(`Missing production function: ${from}`);
  }
  return sql.slice(start, end);
}

try {
  await postgres.initialise();
  await postgres.start();
  const db = await client();
  async function runFile(path) {
    try {
      await db.query(await source(path));
      console.log(`Passed: ${path}`);
    } catch (error) {
      throw new Error(`${path}: ${error.message}`, { cause: error });
    }
  }
  await runFile("scripts/fixtures/cai/bootstrap.sql");
  await runFile(
    "supabase/migrations/20261112000000_create_order_remittance_documents.sql"
  );
  const primitives = await source(
    "supabase/migrations/20261112010000_order_remittance_document_commit.sql"
  );
  await db.query(
    section(
      primitives,
      "CREATE FUNCTION public.order_remittance_number_key(",
      "-- Las cantidades"
    )
  );
  const dispatch = await source(
    "supabase/migrations/20261120000000_standalone_order_remittance_dispatch.sql"
  );
  await db.query(
    section(
      dispatch,
      "CREATE FUNCTION public.order_remittance_dispatch_items(",
      "CREATE OR REPLACE FUNCTION public.lock_order_remittance_dispatch_sources("
    )
  );
  await db.query(
    section(
      dispatch,
      "CREATE OR REPLACE FUNCTION public.persist_order_remittance_documents_internal(",
      "CREATE OR REPLACE FUNCTION public.finalize_order_remittance_dispatch_internal("
    )
  );
  await runFile("supabase/migrations/20261123000000_remittance_cai.sql");
  await runFile(
    "supabase/migrations/20261124000000_separate_cai_remittance_numbering.sql"
  );
  await runFile("scripts/fixtures/cai/flows.sql");
  const first = await client();
  const second = await client();
  async function concurrent(firstSql, secondSql) {
    await first.query("BEGIN");
    await first.query(firstSql);
    const waiting = second.query(secondSql);
    await first.query("SELECT pg_sleep(0.1)");
    await first.query("COMMIT");
    await waiting;
  }
  await concurrent("SELECT test_issue_cai()", "SELECT test_issue_cai()");
  await db.query(`DO $$ BEGIN
    IF (SELECT next_number FROM remittance_cai_authorizations WHERE state='active')<>5
    OR (SELECT count(*) FROM order_remittances WHERE document_number IN ('00009-00000003','00009-00000004'))<>2
    THEN RAISE EXCEPTION 'Concurrent issuance duplicated or skipped numbers'; END IF;
  END; $$`);
  await runFile("scripts/fixtures/cai/persistence.sql");
  await concurrent(
    "SELECT test_persist(args) FROM test_persistence_concurrency WHERE id=1",
    "SELECT test_persist(args) FROM test_persistence_concurrency WHERE id=2"
  );
  await db.query(`DO $$ DECLARE v_org uuid; BEGIN
    SELECT (args->>'org')::uuid INTO v_org FROM test_persistence_concurrency WHERE id=1;
    IF (SELECT remittance_last_number FROM organizations WHERE id=v_org)<>100
    OR (SELECT next_number FROM remittance_cai_authorizations WHERE organization_id=v_org)<>5
    OR (SELECT count(DISTINCT document_number) FROM order_remittances WHERE organization_id=v_org)<>4
    THEN RAISE EXCEPTION 'Concurrent persistence changed or duplicated numbering'; END IF;
  END; $$`);
  console.log(
    "Passed: CAI lifecycle and production persistence, including concurrent numbering"
  );
} finally {
  await Promise.allSettled(clients.map((connection) => connection.end()));
  try {
    await postgres.stop();
  } finally {
    await rm(databaseDir, { recursive: true, force: true });
  }
}
