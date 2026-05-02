import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type UseBarcodeScannerInputOptions = {
  searchValue: string;
  setSearchValue: (value: string) => void;
  onBarcodeScanned: (barcode: string) => Promise<void> | void;
  onScanError?: (error: unknown) => void;
};

export function useBarcodeScannerInput({
  searchValue,
  setSearchValue,
  onBarcodeScanned,
  onScanError,
}: UseBarcodeScannerInputOptions) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);

  const focusSearchInput = useCallback(() => {
    searchInputRef.current?.focus();
  }, []);

  const clearSearchAndFocus = useCallback(() => {
    setSearchValue("");
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, [setSearchValue]);

  const handleSearchInputKeyDown = useCallback(
    async (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();

      if (isScanning) {
        return;
      }

      const scannedBarcode = searchValue.trim();
      if (!scannedBarcode) {
        focusSearchInput();
        return;
      }

      setIsScanning(true);
      try {
        await onBarcodeScanned(scannedBarcode);
      } catch (error) {
        onScanError?.(error);
      } finally {
        setIsScanning(false);
        clearSearchAndFocus();
      }
    },
    [
      clearSearchAndFocus,
      focusSearchInput,
      isScanning,
      onBarcodeScanned,
      onScanError,
      searchValue,
    ]
  );

  useEffect(() => {
    focusSearchInput();
  }, [focusSearchInput]);

  return {
    searchInputRef,
    isScanning,
    focusSearchInput,
    handleSearchInputKeyDown,
  };
}
