"use client";

import Image from "next/image";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export function AppLogo() {
  return (
    <div className="group/logo flex items-center gap-2">
      <div className="relative flex-1 group-data-[collapsible=icon]:flex-none">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="hover:bg-sidebar group-data-[collapsible=icon]:justify-center"
              size="lg"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:w-auto">
                <Image
                  alt="Rhino"
                  className="h-4 w-auto transition-opacity group-data-[collapsible=icon]:h-3.5 group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:group-hover/logo:opacity-0"
                  height={16}
                  src="/images/favicon.svg"
                  width={16}
                />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-bold font-space-grotesk text-xl">
                  Rhinos
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-data-[collapsible=icon]:group-hover/logo:pointer-events-auto group-data-[collapsible=icon]:group-hover/logo:opacity-100">
          <SidebarTrigger className="size-8" />
        </div>
      </div>
      <div className="group-data-[collapsible=icon]:hidden">
        <SidebarTrigger className="-ml-1" />
      </div>
    </div>
  );
}
