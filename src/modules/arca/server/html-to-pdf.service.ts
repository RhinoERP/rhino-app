import "server-only";

import { access } from "node:fs/promises";
import chromium from "@sparticuz/chromium-min";
import type { Browser, Page } from "puppeteer-core";
import puppeteer from "puppeteer-core";

const DEFAULT_CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v141.0.0/chromium-v141.0.0-pack.x64.tar";

const PDF_VIEWPORT = {
  width: 794,
  height: 1123,
  deviceScaleFactor: 1,
};

const LOCAL_CHROME_EXECUTABLE_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
];

type ResolvedChromiumExecutable = {
  executablePath: string;
  runtime: "local" | "serverless";
};

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveLocalChromeExecutablePath(): Promise<string | null> {
  for (const executablePath of LOCAL_CHROME_EXECUTABLE_PATHS) {
    if (await pathExists(executablePath)) {
      return executablePath;
    }
  }

  return null;
}

async function resolveChromiumExecutablePath(): Promise<ResolvedChromiumExecutable> {
  const configuredPath =
    process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_EXECUTABLE_PATH;

  if (configuredPath?.trim()) {
    return {
      executablePath: configuredPath.trim(),
      runtime: "local",
    };
  }

  const localChromePath = await resolveLocalChromeExecutablePath();

  if (localChromePath) {
    return {
      executablePath: localChromePath,
      runtime: "local",
    };
  }

  return {
    executablePath: await chromium.executablePath(
      process.env.SPARTICUZ_CHROMIUM_PACK_URL || DEFAULT_CHROMIUM_PACK_URL
    ),
    runtime: "serverless",
  };
}

async function waitForPageAssets(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts?.ready;

    const imagePromises = Array.from(document.images)
      .filter((image) => !image.complete)
      .map(
        (image) =>
          new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          })
      );

    await Promise.all(imagePromises);
  });
}

export async function renderHtmlToPdfBuffer(
  html: string,
  timeoutMs = 30_000
): Promise<Buffer> {
  let browser: Browser | null = null;

  try {
    const { executablePath, runtime } = await resolveChromiumExecutablePath();
    const headless: true | "shell" = runtime === "serverless" ? "shell" : true;

    browser = await puppeteer.launch({
      args:
        runtime === "serverless"
          ? puppeteer.defaultArgs({
              args: chromium.args,
              headless,
            })
          : puppeteer.defaultArgs({
              headless,
            }),
      defaultViewport: PDF_VIEWPORT,
      executablePath,
      headless,
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    await page.setContent(html, {
      timeout: timeoutMs,
      waitUntil: ["domcontentloaded", "networkidle0"],
    });
    await waitForPageAssets(page);

    const pdfBytes = await page.pdf({
      format: "A4",
      margin: {
        bottom: "0mm",
        left: "0mm",
        right: "0mm",
        top: "0mm",
      },
      preferCSSPageSize: true,
      printBackground: true,
    });

    return Buffer.from(pdfBytes);
  } catch (error) {
    throw new Error(
      `No se pudo renderizar el PDF fiscal: ${
        error instanceof Error ? error.message : "Error desconocido"
      }`
    );
  } finally {
    await browser?.close();
  }
}
