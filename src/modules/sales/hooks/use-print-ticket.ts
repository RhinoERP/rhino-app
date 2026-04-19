"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TicketCompanyData, TicketSaleData } from "../types";
import { generateReceiptBuffer } from "../utils/generate-receipt-buffer";

type UsePrintTicketOptions = {
  transport?: PrintTransport;
  defaultPrinterName?: string;
  qzTrayScriptUrl?: string;
  qzCertificatePromise?: () => Promise<string | undefined> | string | undefined;
  qzSignaturePromise?: (
    toSign: string
  ) => Promise<string | undefined> | string | undefined;
  serialOptions?: RhinoSerialOptions;
};

type PrintTicketOptions = {
  sale: TicketSaleData;
  company: TicketCompanyData;
  transport?: PrintTransport;
  printerName?: string;
  copies?: number;
  lineWidth?: number;
};

type PrintTransport = "auto" | "qz-tray" | "web-serial";

type QzRawPrintData = {
  type: "raw";
  format: "hex";
  data: string;
  options?: {
    language?: "ESCPOS";
  };
};

type QzTrayApi = {
  websocket: {
    isActive: () => boolean;
    connect: (options?: Record<string, unknown>) => Promise<void>;
    disconnect: () => Promise<void>;
  };
  security: {
    setCertificatePromise: (
      callback: () => Promise<string | undefined> | string | undefined
    ) => void;
    setSignaturePromise: (
      callback: (
        toSign: string
      ) => Promise<string | undefined> | string | undefined
    ) => void;
  };
  printers: {
    find: (printerName: string) => Promise<unknown>;
    getDefault: () => Promise<string>;
  };
  configs: {
    create: (
      printerName: string,
      options?: Record<string, unknown>
    ) => Record<string, unknown>;
  };
  print: (config: unknown, data: QzRawPrintData[]) => Promise<void>;
};

type WindowWithQz = Window & {
  qz?: QzTrayApi;
};

type RhinoSerialParity = "none" | "even" | "odd";
type RhinoSerialFlowControl = "none" | "hardware";

type RhinoSerialOptions = {
  baudRate: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: RhinoSerialParity;
  bufferSize?: number;
  flowControl?: RhinoSerialFlowControl;
};

type RhinoSerialWriter = {
  write: (data: Uint8Array) => Promise<void>;
  releaseLock: () => void;
};

type RhinoSerialPort = {
  open: (options: RhinoSerialOptions) => Promise<void>;
  close: () => Promise<void>;
  writable?: {
    getWriter: () => RhinoSerialWriter;
  };
};

type RhinoSerial = {
  requestPort: () => Promise<RhinoSerialPort>;
};

const DEFAULT_QZ_TRAY_SCRIPT_URL =
  "https://cdn.jsdelivr.net/npm/qz-tray@2.2.5/qz-tray.js";
const QZ_TRAY_SCRIPT_ID = "rhino-qz-tray-script";
const DEFAULT_SERIAL_OPTIONS: RhinoSerialOptions = {
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  flowControl: "none",
};

let qzScriptPromise: Promise<QzTrayApi> | null = null;

function getNavigatorSerial(): RhinoSerial | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  const serialNavigator = navigator as Navigator & {
    serial?: RhinoSerial;
  };

  return serialNavigator.serial ?? null;
}

function getGlobalQz(): QzTrayApi | null {
  if (typeof window === "undefined") {
    return null;
  }

  return (window as WindowWithQz).qz ?? null;
}

function bytesToHex(buffer: Uint8Array): string {
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

function loadQzTray(scriptUrl: string): Promise<QzTrayApi> {
  const qz = getGlobalQz();
  if (qz) {
    return Promise.resolve(qz);
  }

  if (typeof document === "undefined") {
    throw new Error("No se pudo cargar QZ Tray fuera del navegador.");
  }

  if (!qzScriptPromise) {
    qzScriptPromise = new Promise<QzTrayApi>((resolve, reject) => {
      const onLoad = () => {
        const loadedQz = getGlobalQz();
        if (!loadedQz) {
          reject(
            new Error("QZ Tray script se cargó, pero no expuso la API global.")
          );
          return;
        }

        resolve(loadedQz);
      };

      const onError = () => {
        reject(
          new Error(
            "No se pudo descargar qz-tray.js. Revisá conectividad o script URL."
          )
        );
      };

      const existingScript = document.getElementById(
        QZ_TRAY_SCRIPT_ID
      ) as HTMLScriptElement | null;

      if (existingScript?.dataset.loaded === "true") {
        onLoad();
        return;
      }

      if (existingScript) {
        existingScript.addEventListener("load", onLoad, { once: true });
        existingScript.addEventListener("error", onError, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.id = QZ_TRAY_SCRIPT_ID;
      script.src = scriptUrl;
      script.async = true;
      script.addEventListener(
        "load",
        () => {
          script.dataset.loaded = "true";
          onLoad();
        },
        { once: true }
      );
      script.addEventListener("error", onError, { once: true });

      document.head.appendChild(script);
    }).catch((error) => {
      qzScriptPromise = null;
      throw error;
    });
  }

  return qzScriptPromise;
}

function normalizePrinterName(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (
    value &&
    typeof value === "object" &&
    "name" in value &&
    typeof value.name === "string" &&
    value.name.trim()
  ) {
    return value.name.trim();
  }

  return null;
}

function toPrintableErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "No se pudo imprimir el ticket.";
}

export function usePrintTicket(options: UsePrintTicketOptions = {}) {
  const {
    transport: defaultTransport = "auto",
    defaultPrinterName,
    qzTrayScriptUrl = DEFAULT_QZ_TRAY_SCRIPT_URL,
    qzCertificatePromise,
    qzSignaturePromise,
    serialOptions = DEFAULT_SERIAL_OPTIONS,
  } = options;

  const qzRef = useRef<QzTrayApi | null>(null);
  const serialPortRef = useRef<RhinoSerialPort | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const printWithQzTray = useCallback(
    async (
      buffer: Uint8Array,
      printerName?: string,
      copies = 1
    ): Promise<void> => {
      const qz = qzRef.current ?? (await loadQzTray(qzTrayScriptUrl));
      qzRef.current = qz;

      qz.security.setCertificatePromise(async () => qzCertificatePromise?.());
      qz.security.setSignaturePromise(async (toSign: string) =>
        qzSignaturePromise?.(toSign)
      );

      if (!qz.websocket.isActive()) {
        await qz.websocket.connect({
          retries: 2,
          delay: 1,
        });
      }

      const preferredPrinter = printerName?.trim() || defaultPrinterName;
      const targetPrinter = preferredPrinter
        ? normalizePrinterName(await qz.printers.find(preferredPrinter))
        : null;
      const finalPrinter = targetPrinter ?? (await qz.printers.getDefault());

      if (!finalPrinter) {
        throw new Error("No se encontró una impresora térmica configurada.");
      }

      const config = qz.configs.create(finalPrinter, {
        copies,
        encoding: "Cp1252",
      });

      await qz.print(config, [
        {
          type: "raw",
          format: "hex",
          options: { language: "ESCPOS" },
          data: bytesToHex(buffer),
        },
      ]);
    },
    [
      defaultPrinterName,
      qzCertificatePromise,
      qzSignaturePromise,
      qzTrayScriptUrl,
    ]
  );

  const printWithWebSerial = useCallback(
    async (buffer: Uint8Array): Promise<void> => {
      const serial = getNavigatorSerial();
      if (!serial) {
        throw new Error(
          "Web Serial API no está disponible. Usá QZ Tray o Chrome/Edge compatible."
        );
      }

      let port = serialPortRef.current;
      if (!port) {
        port = await serial.requestPort();
        await port.open(serialOptions);
        serialPortRef.current = port;
      }

      const writer = port.writable?.getWriter();
      if (!writer) {
        throw new Error(
          "No se pudo abrir el canal de escritura serial en la impresora."
        );
      }

      try {
        await writer.write(buffer);
      } finally {
        writer.releaseLock();
      }
    },
    [serialOptions]
  );

  const printWithSelectedTransport = useCallback(
    async (
      selectedTransport: PrintTransport,
      ticketBuffer: Uint8Array,
      printerName: string | undefined,
      copies: number
    ): Promise<void> => {
      if (selectedTransport === "qz-tray") {
        await printWithQzTray(ticketBuffer, printerName, copies);
        return;
      }

      if (selectedTransport === "web-serial") {
        await printWithWebSerial(ticketBuffer);
        return;
      }

      try {
        await printWithQzTray(ticketBuffer, printerName, copies);
      } catch (qzError) {
        if (!getNavigatorSerial()) {
          throw qzError;
        }

        await printWithWebSerial(ticketBuffer);
      }
    },
    [printWithQzTray, printWithWebSerial]
  );

  const printTicket = useCallback(
    async ({
      sale,
      company,
      transport,
      printerName,
      copies = 1,
      lineWidth,
    }: PrintTicketOptions): Promise<boolean> => {
      if (typeof window === "undefined") {
        return false;
      }

      setIsPrinting(true);
      setIsSuccess(false);
      setError(null);

      const selectedTransport = transport ?? defaultTransport;
      const ticketBuffer = generateReceiptBuffer({
        sale,
        company,
        lineWidth,
      });

      try {
        await printWithSelectedTransport(
          selectedTransport,
          ticketBuffer,
          printerName,
          copies
        );

        setIsSuccess(true);
        return true;
      } catch (printError) {
        setError(toPrintableErrorMessage(printError));
        return false;
      } finally {
        setIsPrinting(false);
      }
    },
    [defaultTransport, printWithSelectedTransport]
  );

  const resetPrintState = useCallback(() => {
    setIsSuccess(false);
    setError(null);
  }, []);

  useEffect(
    () => () => {
      const serialPort = serialPortRef.current;
      const qz = qzRef.current;

      serialPortRef.current = null;
      qzRef.current = null;

      if (serialPort) {
        serialPort.close().catch(() => {
          // noop
        });
      }

      if (qz?.websocket.isActive()) {
        qz.websocket.disconnect().catch(() => {
          // noop
        });
      }
    },
    []
  );

  return {
    isPrinting,
    isSuccess,
    error,
    printTicket,
    resetPrintState,
  };
}
