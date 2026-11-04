import { createServer } from "node:http";
import { hostname } from "node:os";
import { audioEnabled, positiveInteger } from "./audio/config.js";
import { processAudioJob } from "./audio/jobs.js";
import {
  createCommercialJobProcessor,
  getMissingCommercialEnvironment,
} from "./commercial-agent.js";
import {
  claimJob,
  executeJob,
  type JobType,
  workerDatabaseReady,
} from "./jobs.js";
import { createWorkerSupabaseClient } from "./worker.js";

const port = Number(process.env.PORT || "3002");
const pollMs = positiveInteger(
  process.env.WHATSAPP_AGENT_POLL_INTERVAL_MS,
  5000,
  60_000
);
const role =
  process.argv.find((argument) => argument.startsWith("--role="))?.slice(7) ||
  process.env.WHATSAPP_AGENT_WORKER_ROLE ||
  "all";
if (!["all", "transcription", "commercial"].includes(role)) {
  throw new Error("Rol inválido: all, transcription o commercial.");
}
const workerId =
  process.env.WHATSAPP_AGENT_WORKER_ID || `${hostname()}-${process.pid}`;
const db = createWorkerSupabaseClient();
const commercial = createCommercialJobProcessor(db);
let stopped = false;
let databaseReady = false;
const tasks = new Set<Promise<void>>();
const missing =
  role === "transcription"
    ? ["OPENAI_API_KEY", "WHATSAPP_META_ACCESS_TOKEN"].filter(
        (key) => !process.env[key]?.trim()
      )
    : getMissingCommercialEnvironment();

async function consumer(type: JobType, slot: number): Promise<void> {
  while (!stopped) {
    let worked = false;
    try {
      const job = await claimJob(db, type, {
        workerId: `${workerId}-${type}-${slot}`,
      });
      if (job) {
        worked = true;
        await executeJob(
          db,
          job,
          type === "TRANSCRIBE_AUDIO"
            ? (item) => processAudioJob(db, item)
            : commercial
        );
      }
    } catch (error) {
      console.error("[whatsapp-agent] fallo del trabajo", {
        type,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
    if (!(worked || stopped)) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
}

function startConsumers(type: JobType, count: number): void {
  for (let slot = 0; slot < count; slot += 1) {
    const task = consumer(type, slot);
    tasks.add(task);
    task.finally(() => tasks.delete(task));
  }
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(!missing.length && databaseReady ? 200 : 503, {
      "Content-Type": "application/json",
    });
    response.end(
      JSON.stringify({
        ok: true,
        configured: !missing.length && databaseReady,
        databaseReady,
        missingConfiguration: missing,
        role,
        audioEnabled: audioEnabled(),
        service: "whatsapp-agent",
        workerId,
        activeConsumers: tasks.size,
      })
    );
  } else {
    response.writeHead(404);
    response.end();
  }
}).listen(port, () => {
  if (missing.length) {
    console.warn("[whatsapp-agent] configuración incompleta", {
      role,
      missing,
    });
    return;
  }
  const startup = startWhenDatabaseReady();
  tasks.add(startup);
  startup.finally(() => tasks.delete(startup));
});

async function startWhenDatabaseReady(): Promise<void> {
  let reported = false;
  while (!(stopped || databaseReady)) {
    databaseReady = await workerDatabaseReady(db);
    if (databaseReady) {
      break;
    }
    if (!reported) {
      console.warn(
        "[whatsapp-agent] falta completar la migración del protocolo; no se consumen trabajos"
      );
      reported = true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  if (stopped) {
    return;
  }
  if (role !== "transcription") {
    startConsumers(
      "PROCESS_CONVERSATION",
      positiveInteger(process.env.WHATSAPP_AGENT_COMMERCIAL_CONCURRENCY, 1, 8)
    );
  }
  // Drain disabled audio jobs into a terminal fallback so they cannot block text.
  if (role !== "commercial") {
    startConsumers(
      "TRANSCRIBE_AUDIO",
      positiveInteger(process.env.WHATSAPP_AGENT_AUDIO_CONCURRENCY, 1, 8)
    );
  }
  console.log("[whatsapp-agent] worker configurado; iniciando polling", {
    role,
    workerId,
  });
}

async function shutdown(): Promise<void> {
  if (stopped) {
    return;
  }
  stopped = true;
  server.close();
  await Promise.allSettled([...tasks]);
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
