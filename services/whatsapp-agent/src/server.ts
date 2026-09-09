import { createServer } from "node:http";
import { hostname } from "node:os";
import {
  createCommercialJobProcessor,
  isCommercialAgentConfigured,
} from "./commercial-agent.js";
import { createWorkerSupabaseClient, WhatsAppWorker } from "./worker.js";

const port = Number(process.env.PORT ?? "3002");
const pollIntervalMs = Number(
  process.env.WHATSAPP_AGENT_POLL_INTERVAL_MS ?? "1000"
);
const workerId =
  process.env.WHATSAPP_AGENT_WORKER_ID ?? `${hostname()}-${process.pid}`;

const supabase = createWorkerSupabaseClient();
const isConfigured = isCommercialAgentConfigured();
const worker = new WhatsAppWorker({
  workerId,
  supabase,
  process: createCommercialJobProcessor(supabase),
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
      JSON.stringify({
        ok: true,
        configured: isConfigured,
        service: "whatsapp-agent",
        workerId,
      })
    );
    return;
  }
  response.writeHead(404);
  response.end();
}).listen(port, () => {
  console.log(`[whatsapp-agent] escuchando en ${port}`);
  if (isConfigured) {
    poll().catch((error: unknown) => {
      console.error("[whatsapp-agent] no se pudo iniciar el polling", error);
    });
  } else {
    console.warn(
      "[whatsapp-agent] faltan variables comerciales; el worker no reclamará trabajos"
    );
  }
});

function shutdown(): void {
  stopped = true;
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
