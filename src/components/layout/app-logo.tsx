"use client";

import Image from "next/image";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function AppLogo() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          className="group-data-[collapsible=icon]:justify-center"
          size="lg"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:w-auto">
            <Image
              alt="Rhino"
              className="h-4 w-auto group-data-[collapsible=icon]:h-3.5 group-data-[collapsible=icon]:w-auto"
              height={16}
              src="/images/favicon.svg"
              width={16}
            />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-bold text-lg">Rhino</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
