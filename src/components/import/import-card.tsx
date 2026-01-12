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
    <Card className="group relative overflow-hidden transition-all hover:border-primary/50 hover:shadow-md">
      <CardHeader>
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          className="w-full"
          disabled={disabled}
          onClick={onClick}
          variant="outline"
        >
          <Upload className="mr-2 h-4 w-4" />
          Importar
        </Button>
      </CardContent>
    </Card>
  );
}
