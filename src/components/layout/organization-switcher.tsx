import { Building2, ChevronsUpDown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  getOrganizationBySlug,
  getUserOrganizations,
} from "@/modules/organizations/service/organizations.service";

type OrganizationSwitcherProps = {
  orgSlug: string;
};

export async function OrganizationSwitcher({
  orgSlug,
}: OrganizationSwitcherProps) {
  const currentOrg = await getOrganizationBySlug(orgSlug);
  const userOrgs = await getUserOrganizations();

  if (!currentOrg) {
    return null;
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              size="lg"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
                <Image
                  alt="Rhino"
                  className="size-4"
                  height={16}
                  src="/images/favicon.svg"
                  width={32}
                />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Rhino</span>
                <span className="truncate text-xs">{currentOrg.name}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side="bottom"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Organizaciones
            </DropdownMenuLabel>
            {userOrgs.map((org) => (
              <DropdownMenuItem asChild className="gap-2 p-2" key={org.id}>
                <Link href={`/org/${org.slug || org.id}`}>
                  <div className="flex size-6 items-center justify-center rounded-sm border">
                    <Building2 className="size-4 shrink-0" />
                  </div>
                  <div className="font-medium">{org.name}</div>
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
