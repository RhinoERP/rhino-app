"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TicketCompanyData, TicketSaleData } from "../types";
import { generateReceiptBuffer } from "../utils/generate-receipt-buffer";

type RhinoUsbEndpointDirection = "in" | "out";

type RhinoUsbDeviceFilter = {
  classCode?: number;
  subclassCode?: number;
  protocolCode?: number;
  vendorId?: number;
  productId?: number;
  serialNumber?: string;
};

type RhinoUsbEndpoint = {
  direction: RhinoUsbEndpointDirection;
  endpointNumber: number;
};

type RhinoUsbAlternateInterface = {
  alternateSetting: number;
  endpoints: RhinoUsbEndpoint[];
};

type RhinoUsbInterface = {
  interfaceNumber: number;
  alternate: RhinoUsbAlternateInterface;
  alternates: RhinoUsbAlternateInterface[];
};

type RhinoUsbConfiguration = {
  configurationValue: number;
  interfaces: RhinoUsbInterface[];
};

type RhinoUsbOutTransferResult = {
  status: "ok" | "stall" | "babble";
};

type RhinoUsbDevice = {
  opened: boolean;
  configuration: RhinoUsbConfiguration | null;
  configurations: RhinoUsbConfiguration[];
  open: () => Promise<void>;
  close: () => Promise<void>;
  selectConfiguration: (configurationValue: number) => Promise<void>;
  claimInterface: (interfaceNumber: number) => Promise<void>;
  selectAlternateInterface: (
    interfaceNumber: number,
    alternateSetting: number
  ) => Promise<void>;
  transferOut: (
    endpointNumber: number,
    data: Uint8Array
  ) => Promise<RhinoUsbOutTransferResult>;
};

type RhinoUsb = {
  requestDevice: (options: {
    filters: RhinoUsbDeviceFilter[];
  }) => Promise<RhinoUsbDevice>;
  getDevices: () => Promise<RhinoUsbDevice[]>;
};

type PrintTransport = "auto" | "web-usb";

type UsePrintTicketOptions = {
  transport?: PrintTransport;
  usbFilters?: RhinoUsbDeviceFilter[];
};

type PrintTicketOptions = {
  sale: TicketSaleData;
  company: TicketCompanyData;
  transport?: PrintTransport;
  copies?: number;
  lineWidth?: number;
};

type WindowWithNavigatorUsb = Navigator & {
  usb?: RhinoUsb;
};

type UsbWriteEndpoint = {
  configurationValue: number;
  interfaceNumber: number;
  alternateSetting: number;
  endpointNumber: number;
};

const USB_PRINTER_CLASS_CODE = 0x07;
const DEFAULT_USB_FILTERS: RhinoUsbDeviceFilter[] = [
  {
    classCode: USB_PRINTER_CLASS_CODE,
  },
];

function getNavigatorUsb(): RhinoUsb | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  return (navigator as WindowWithNavigatorUsb).usb ?? null;
}

function toPrintableErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "NotFoundError"
  ) {
    return "No se seleccionó ninguna impresora USB.";
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const valueWithMessage = error as { message?: unknown };
    if (
      typeof valueWithMessage.message === "string" &&
      valueWithMessage.message.trim()
    ) {
      return valueWithMessage.message.trim();
    }
  }

  return "No se pudo imprimir el ticket.";
}

function findUsbWriteEndpoint(device: RhinoUsbDevice): UsbWriteEndpoint | null {
  let configurations: RhinoUsbConfiguration[] = [];

  if (device.configurations.length > 0) {
    configurations = device.configurations;
  } else if (device.configuration) {
    configurations = [device.configuration];
  }

  for (const configuration of configurations) {
    for (const usbInterface of configuration.interfaces) {
      for (const alternate of usbInterface.alternates) {
        const outEndpoint = alternate.endpoints.find(
          (endpoint) => endpoint.direction === "out"
        );

        if (outEndpoint) {
          return {
            configurationValue: configuration.configurationValue,
            interfaceNumber: usbInterface.interfaceNumber,
            alternateSetting: alternate.alternateSetting,
            endpointNumber: outEndpoint.endpointNumber,
          };
        }
      }
    }
  }

  return null;
}

function getActiveAlternateSetting(
  device: RhinoUsbDevice,
  interfaceNumber: number
): number | null {
  return (
    device.configuration?.interfaces.find(
      (usbInterface) => usbInterface.interfaceNumber === interfaceNumber
    )?.alternate.alternateSetting ?? null
  );
}

function isAlreadyClaimedInterfaceError(error: unknown): boolean {
  const message = toPrintableErrorMessage(error).toLowerCase();
  return message.includes("already claimed");
}

async function prepareUsbDevice(
  device: RhinoUsbDevice
): Promise<UsbWriteEndpoint> {
  const writeEndpoint = findUsbWriteEndpoint(device);

  if (!writeEndpoint) {
    throw new Error(
      "No se encontró un endpoint USB de salida (direction: 'out') en la impresora seleccionada."
    );
  }

  if (!device.opened) {
    await device.open();
  }

  if (
    device.configuration?.configurationValue !==
    writeEndpoint.configurationValue
  ) {
    await device.selectConfiguration(writeEndpoint.configurationValue);
  }

  try {
    await device.claimInterface(writeEndpoint.interfaceNumber);
  } catch (claimError) {
    if (!isAlreadyClaimedInterfaceError(claimError)) {
      throw claimError;
    }
  }

  if (
    getActiveAlternateSetting(device, writeEndpoint.interfaceNumber) !==
    writeEndpoint.alternateSetting
  ) {
    await device.selectAlternateInterface(
      writeEndpoint.interfaceNumber,
      writeEndpoint.alternateSetting
    );
  }

  return writeEndpoint;
}

export function usePrintTicket(options: UsePrintTicketOptions = {}) {
  const {
    transport: defaultTransport = "web-usb",
    usbFilters = DEFAULT_USB_FILTERS,
  } = options;

  const usbDeviceRef = useRef<RhinoUsbDevice | null>(null);
  const usbWriteEndpointRef = useRef<UsbWriteEndpoint | null>(null);

  const [isPrinting, setIsPrinting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bindUsbDevice = useCallback(async (device: RhinoUsbDevice) => {
    const writeEndpoint = await prepareUsbDevice(device);
    usbDeviceRef.current = device;
    usbWriteEndpointRef.current = writeEndpoint;
  }, []);

  const conectarImpresora = useCallback(async (): Promise<boolean> => {
    const usb = getNavigatorUsb();
    if (!usb) {
      throw new Error(
        "WebUSB API no está disponible en este navegador. Usá Chrome/Edge con HTTPS o localhost."
      );
    }

    const device = await usb.requestDevice({
      filters: usbFilters.length > 0 ? usbFilters : DEFAULT_USB_FILTERS,
    });

    await bindUsbDevice(device);
    return true;
  }, [bindUsbDevice, usbFilters]);

  const reconnectAuthorizedPrinter = useCallback(async (): Promise<boolean> => {
    const usb = getNavigatorUsb();
    if (!usb) {
      return false;
    }

    const authorizedDevices = await usb.getDevices();
    for (const device of authorizedDevices) {
      if (!findUsbWriteEndpoint(device)) {
        continue;
      }

      try {
        await bindUsbDevice(device);
        return true;
      } catch {
        // Intentamos con el siguiente dispositivo autorizado.
      }
    }

    return false;
  }, [bindUsbDevice]);

  const ensureConnectedUsbPrinter = useCallback(async (): Promise<void> => {
    const currentDevice = usbDeviceRef.current;

    if (currentDevice) {
      await bindUsbDevice(currentDevice);
      return;
    }

    if (await reconnectAuthorizedPrinter()) {
      return;
    }

    await conectarImpresora();
  }, [bindUsbDevice, conectarImpresora, reconnectAuthorizedPrinter]);

  const printWithWebUsb = useCallback(
    async (buffer: Uint8Array, copies = 1): Promise<void> => {
      await ensureConnectedUsbPrinter();

      const device = usbDeviceRef.current;
      const writeEndpoint = usbWriteEndpointRef.current;

      if (!(device && writeEndpoint)) {
        throw new Error(
          "No hay una impresora USB conectada. Volvé a vincularla e intentá nuevamente."
        );
      }

      for (let copyIndex = 0; copyIndex < copies; copyIndex += 1) {
        const result = await device.transferOut(
          writeEndpoint.endpointNumber,
          buffer
        );

        if (result.status !== "ok") {
          throw new Error(
            `La impresora USB rechazó la escritura en el endpoint ${writeEndpoint.endpointNumber} (status: ${result.status}).`
          );
        }
      }
    },
    [ensureConnectedUsbPrinter]
  );

  const printWithSelectedTransport = useCallback(
    async (
      selectedTransport: PrintTransport,
      ticketBuffer: Uint8Array,
      copies: number
    ): Promise<void> => {
      if (selectedTransport === "web-usb" || selectedTransport === "auto") {
        await printWithWebUsb(ticketBuffer, copies);
        return;
      }

      throw new Error("Transporte de impresión no soportado.");
    },
    [printWithWebUsb]
  );

  const printTicket = useCallback(
    async ({
      sale,
      company,
      transport,
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
      const printedAt = new Date().toISOString();
      const ticketBuffer = generateReceiptBuffer({
        sale: {
          ...sale,
          printedAt,
        },
        company,
        lineWidth,
      });

      try {
        await printWithSelectedTransport(
          selectedTransport,
          ticketBuffer,
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
      const usbDevice = usbDeviceRef.current;

      usbDeviceRef.current = null;
      usbWriteEndpointRef.current = null;

      if (usbDevice?.opened) {
        usbDevice.close().catch(() => {
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
    conectarImpresora,
  };
}
