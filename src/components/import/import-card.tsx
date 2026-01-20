"use client";

import { Upload } from "@phosphor-icons/react";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ImportCardProps = {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
};

export function ImportCard({
  title,
  description,
  icon,
  onClick,
  disabled = false,
}: ImportCardProps) {
  return (
    <Card className="group relative flex h-full flex-col overflow-hidden transition-all duration-200 hover:border-primary/40 hover:shadow-lg">
      <CardHeader className="flex-1 pb-4">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors duration-200 group-hover:bg-primary/15">
          {icon}
        </div>
        <CardTitle className="font-semibold text-lg">{title}</CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Button
          className="w-full transition-all duration-200 group-hover:bg-primary group-hover:text-primary-foreground"
          disabled={disabled}
          onClick={onClick}
          size="sm"
          variant="outline"
        >
          <Upload className="mr-2 h-4 w-4" weight="bold" />
          Importar
        </Button>
      </CardContent>
    </Card>
  );
}
