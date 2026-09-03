import { createServer } from "node:http";
import { hostname } from "node:os";
import { createWorkerSupabaseClient, WhatsAppWorker } from "./worker.js";

const port = Number(process.env.PORT ?? "3002");
const pollIntervalMs = Number(
  process.env.WHATSAPP_AGENT_POLL_INTERVAL_MS ?? "1000"
);
const workerId =
  process.env.WHATSAPP_AGENT_WORKER_ID ?? `${hostname()}-${process.pid}`;

function acknowledgeTransportJob(): Promise<void> {
  // La fase 3 sustituye este procesador por la ejecución del asistente.
  return Promise.resolve();
}

const worker = new WhatsAppWorker({
  workerId,
  supabase: createWorkerSupabaseClient(),
  // La fase 2 deja el transporte listo y termina el trabajo de forma segura.
  process: acknowledgeTransportJob,
});

let running = false;
let stopped = false;

async function poll(): Promise<void> {
  if (stopped) {
    return;
  }
  try {
    if (!running) {
      running = true;
      while (await worker.runOnce()) {
        // Drenar los trabajos disponibles antes de volver a esperar.
      }
    }
  } catch (error) {
    console.error(
      "[whatsapp-agent] error del worker",
      error instanceof Error ? error.message : "unknown"
    );
  } finally {
    running = false;
    if (!stopped) {
      setTimeout(poll, pollIntervalMs);
    }
  }
}

createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({ ok: true, service: "whatsapp-agent", workerId })
    );
    return;
  }
  response.writeHead(404);
  response.end();
}).listen(port, () => {
  console.log(`[whatsapp-agent] escuchando en ${port}`);
  poll().catch((error: unknown) => {
    console.error("[whatsapp-agent] no se pudo iniciar el polling", error);
  });
});

function shutdown(): void {
  stopped = true;
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
