"use client";

import { BuildingsIcon, CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Organization } from "@/modules/organizations/types";

type MobileOrganizationSwitcherProps = {
  currentOrganization: Organization;
  organizations: Organization[];
};

export function MobileOrganizationSwitcher({
  currentOrganization,
  organizations,
}: MobileOrganizationSwitcherProps) {
  return (
    <div className="sticky top-0 z-40 border-b bg-background/95 px-3 py-2 backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`Organizacion actual: ${currentOrganization.name}. Cambiar organizacion`}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BuildingsIcon className="size-5" weight="duotone" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                Organizacion
              </span>
              <span className="block truncate font-semibold text-sm">
                {currentOrganization.name}
              </span>
            </span>
            <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[calc(100vw-1.5rem)] max-w-sm"
          sideOffset={6}
        >
          <DropdownMenuLabel>Cambiar organizacion</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {organizations.map((organization) => {
            const isCurrent = organization.id === currentOrganization.id;

            return (
              <DropdownMenuItem asChild key={organization.id}>
                <Link
                  className="flex items-center gap-2"
                  href={`/org/${organization.slug}`}
                >
                  <BuildingsIcon className="size-4" weight="duotone" />
                  <span className="min-w-0 flex-1 truncate">
                    {organization.name}
                  </span>
                  {isCurrent && (
                    <CheckIcon className="size-4 text-primary" weight="bold" />
                  )}
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
