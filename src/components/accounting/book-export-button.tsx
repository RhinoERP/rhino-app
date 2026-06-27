"use client";

import { ArrowDownToLine } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type BookExportFormat = "xlsx" | "csv" | "txt";

const EXPORT_FORMAT_OPTIONS: Array<{ label: string; value: BookExportFormat }> =
  [
    { label: "XLSX", value: "xlsx" },
    { label: "CSV", value: "csv" },
    { label: "TXT", value: "txt" },
  ];

type Props = {
  buildHref: (format: BookExportFormat) => string | undefined;
  disabled?: boolean;
  defaultFormat?: BookExportFormat;
};

export function BookExportButton({
  buildHref,
  disabled = false,
  defaultFormat = "xlsx",
}: Props) {
  const [format, setFormat] = useState<BookExportFormat>(defaultFormat);
  const href = buildHref(format);
  const button = (
    <Button disabled={disabled || !href} size="sm" variant="outline">
      <ArrowDownToLine className="mr-2 h-4 w-4" />
      Exportar {format.toUpperCase()}
    </Button>
  );

  return (
    <div className="flex items-end gap-2">
      <Select
        onValueChange={(value: BookExportFormat) => setFormat(value)}
        value={format}
      >
        <SelectTrigger className="w-28">
          <SelectValue placeholder="Formato" />
        </SelectTrigger>
        <SelectContent>
          {EXPORT_FORMAT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {href ? (
        <a download href={href}>
          {button}
        </a>
      ) : (
        button
      )}
    </div>
  );
}
