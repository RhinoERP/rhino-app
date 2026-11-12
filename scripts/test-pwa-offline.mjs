import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";
import {
  makePwaTestSnapshot,
  testSignature,
} from "./fixtures/pwa-snapshot.mjs";

// A real network cut at the origin also affects the service worker. Merely
// setting a page offline in CDP does not reliably disconnect worker fetches.
test("installed PWA survives a cold start without a server", async () => {
  const upstream = new URL(process.env.PWA_TEST_URL ?? "http://localhost:3000");
  const profile = await mkdtemp(join(tmpdir(), "rhinos-pwa-test-"));
  let connected = true;
  const receivedQuotes = [];
  const relay = http.createServer((request, response) => {
    if (!connected) {
      request.socket.destroy();
      return;
    }
    // These test requests never reach Supabase or create commercial records.
    if (request.url === "/api/v1/offline-sales-quote-requests") {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        receivedQuotes.push(JSON.parse(body));
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({ requestId: "00000000-0000-4000-8000-000000000006" })
        );
      });
      return;
    }
    if (request.url.startsWith("/api/v1/org/pwa-test/")) {
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Test snapshot remains local" }));
      return;
    }
    const target = new URL(request.url, upstream);
    const transport = target.protocol === "https:" ? https : http;
    const remote = transport.request(
      target,
      {
        method: request.method,
        headers: { ...request.headers, host: target.host },
      },
      (result) => {
        response.writeHead(result.statusCode, result.headers);
        result.pipe(response);
      }
    );
    remote.on("error", () => response.destroy());
    request.pipe(remote);
  });
  await new Promise((resolve) => relay.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${relay.address().port}`;
  const launch = () =>
    puppeteer.launch({
      executablePath:
        process.env.CHROME_PATH ??
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
      userDataDir: profile,
    });
  const offlinePages = [
    "/offline.html",
    "/~offline",
    "/~offline/datos",
    "/~offline/borradores",
    "/~offline/preventa",
    "/~offline/cotizaciones",
  ];
  let browser;
  try {
    browser = await launch();
    const page = await browser.newPage();
    await page.goto(`${origin}/~offline/datos`, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => navigator.serviceWorker.controller, {
      timeout: 120_000,
    });
    const cachedPaths = await page.evaluate(async () => {
      const keys = (await caches.keys()).filter((key) =>
        key.includes("precache")
      );
      const requests = await Promise.all(
        keys.map(async (key) => (await caches.open(key)).keys())
      );
      return requests.flat().map((request) => new URL(request.url).pathname);
    });
    for (const path of offlinePages) {
      assert(
        cachedPaths.includes(path),
        `Missing precache: ${path}. Use pnpm build + pnpm start, not pnpm dev.`
      );
    }
    assert(
      !cachedPaths.some(
        (path) => path.startsWith("/org/") || path.startsWith("/api/")
      )
    );
    console.log(
      `PASS installed: ${cachedPaths.length} entries, all offline pages present`
    );

    const shell = await page.evaluate(async () => {
      const cache = await caches.open(
        (await caches.keys()).find((name) => name.includes("precache"))
      );
      const key = (await cache.keys()).find(
        (entry) => new URL(entry.url).pathname === "/offline.html"
      );
      return (await cache.match(key)).text();
    });
    assert(
      shell.includes("<title>Rhinos · Acceso offline</title>"),
      "Precache must contain the offline shell, never an authentication redirect"
    );

    await browser.close();
    connected = false;
    relay.closeAllConnections();
    browser = await launch();
    const coldPage = await browser.newPage();
    await coldPage.setCacheEnabled(false);
    const errors = [];
    coldPage.on("pageerror", (error) => errors.push(error.message));
    for (const path of [
      "/offline.html",
      "/",
      "/org/test/ventas",
      "/org/test/solicitudes-venta/nueva",
    ]) {
      const response = await coldPage.goto(`${origin}${path}`, {
        waitUntil: "networkidle2",
      });
      assert(
        response.fromServiceWorker(),
        `${path} must be served by the worker`
      );
      await coldPage
        .waitForFunction(
          () => document.querySelector("h1")?.textContent === "Sin conexion"
        )
        .catch(async (error) => {
          console.error({
            path,
            url: coldPage.url(),
            body: await coldPage.evaluate(() => document.body.innerText),
            errors,
          });
          throw error;
        });
      assert.equal(coldPage.url(), `${origin}/~offline`);
      await coldPage.waitForFunction(() => {
        const logo = document.querySelector('img[alt="Rhinos"]');
        return logo?.complete && logo.naturalWidth > 0;
      });
      console.log(`PASS unified cold offline screen and logo: ${path}`);
    }
    const expected = [
      ["/~offline", "Sin conexion"],
      ["/~offline/datos", "No hay datos descargados"],
      ["/~offline/borradores", "No hay datos offline"],
      ["/~offline/preventa", "Datos offline no disponibles"],
      ["/~offline/cotizaciones", "Cotizaciones offline no preparadas"],
    ];
    for (const [path, text] of expected) {
      await coldPage.goto(`${origin}${path}`, { waitUntil: "networkidle2" });
      await coldPage.waitForFunction(
        (label) => document.body.innerText.includes(label),
        {},
        text
      );
      console.log(`PASS offline hydration: ${path}`);
    }
    const privateFetches = await coldPage.evaluate(async () => {
      const results = await Promise.allSettled([
        fetch("/api/v1/offline-sales-quote-requests"),
        fetch("/org/test/ventas?_rsc=test", { headers: { RSC: "1" } }),
      ]);
      return results.map((result) => result.status);
    });
    assert.deepEqual(privateFetches, ["rejected", "rejected"]);
    assert.deepEqual(errors, []);
    console.log(
      "PASS APIs/RSC do not receive cached HTML; no JavaScript crashes"
    );
    const snapshot = makePwaTestSnapshot();
    const storage = await build({
      entryPoints: ["src/modules/offline/storage/offline-db.ts"],
      bundle: true,
      write: false,
      platform: "browser",
      format: "iife",
      globalName: "pwaTestStorage",
    });
    const storageScript = storage.outputFiles[0].text;
    await coldPage.addScriptTag({ content: storageScript });
    await coldPage.evaluate(
      async (value, signature) => {
        await window.pwaTestStorage.saveSellerSnapshot({
          value,
          signature,
          byteSize: JSON.stringify(value).length,
        });
      },
      snapshot,
      testSignature
    );
    await coldPage.reload({ waitUntil: "networkidle2" });
    await coldPage.waitForSelector('input[placeholder="Ej.: Zona 6"]');
    await coldPage.select(
      `select:has(option[value="${snapshot.customers[0].id}"])`,
      snapshot.customers[0].id
    );
    await coldPage.type('input[placeholder="Ej.: Zona 6"]', "Zona de prueba");
    await coldPage.type(
      'input[placeholder="Ej.: Efectivo o transferencia"]',
      "Efectivo"
    );
    await coldPage.type(
      'input[placeholder="Ej.: Contado o 21 días"]',
      "Contado"
    );
    await coldPage.select(
      `select:has(option[value="${snapshot.products[0].id}"])`,
      snapshot.products[0].id
    );
    await coldPage.locator("::-p-text(Agregar producto)").click();
    await coldPage.waitForSelector('option[value="LIST_PRICE"]');
    await coldPage.select(
      'select:has(option[value="LIST_PRICE"])',
      "LIST_PRICE"
    );
    await coldPage.locator("::-p-text(Enviar a aprobación)").click();
    await coldPage.waitForFunction(() =>
      document.body.innerText.includes("Pendiente de envío")
    );
    await coldPage.addScriptTag({ content: storageScript });
    const queued = await coldPage.evaluate(
      async (owner) =>
        window.pwaTestStorage.listOfflineSalesQuoteCommands(owner),
      snapshot.ownerUserId
    );
    assert.equal(queued.length, 1);
    assert.equal(queued[0].command.signature, testSignature);
    assert.equal(queued[0].command.quote.items[0].agreedUnitPrice, 120);
    assert.equal(coldPage.url(), `${origin}/~offline/cotizaciones`);
    console.log(
      "PASS offline quote: real form, signed level price, durable queue, no protected navigation"
    );

    await coldPage.goto(`${origin}/offline.html`, {
      waitUntil: "networkidle2",
    });
    await coldPage.waitForSelector('a[href="/~offline/preventa"]');
    assert.equal(coldPage.url(), `${origin}/~offline`);
    await coldPage.click('a[href="/~offline/preventa"]');
    await coldPage.waitForFunction(() =>
      document.body.innerText.includes("Preventa offline")
    );
    await coldPage.goto(`${origin}/~offline/cotizaciones`, {
      waitUntil: "networkidle2",
    });
    await coldPage.waitForFunction(() =>
      document.body.innerText.includes("Pendiente de envío")
    );
    console.log(
      "PASS offline navigation: Preventa opens with the snapshot and the quote survives leaving/reopening its page"
    );

    connected = true;
    await coldPage.evaluate(() => window.dispatchEvent(new Event("online")));
    await coldPage.waitForFunction(() =>
      document.body.innerText.includes("Enviada a aprobación")
    );
    assert.equal(receivedQuotes.length, 1);
    assert.equal(receivedQuotes[0].commandId, queued[0].command.commandId);
    assert.deepEqual(errors, []);
    console.log(
      "PASS reconnect: public offline page syncs the same command to the mocked API"
    );
  } finally {
    await browser?.close();
    relay.closeAllConnections();
    await new Promise((resolve) => relay.close(resolve));
    await rm(profile, { recursive: true, force: true });
  }
});
